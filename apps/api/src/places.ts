import { z } from 'zod';
import { PlaceSearchInputSchema, VerifiedPlaceSchema, type PlaceSearchInput, type TravelBlockCategory, type VerifiedPlace } from '@travel-blocks/shared';

export interface PlaceSearchProvider {
  search(input: PlaceSearchInput): Promise<VerifiedPlace[]>;
  getPlace(placeId: string): Promise<VerifiedPlace | null>;
}

export type PlaceProviderErrorCode = 'rate_limit' | 'unavailable' | 'timeout' | 'auth' | 'bad_request' | 'not_found' | 'network' | 'invalid_response';

export class PlaceProviderError extends Error {
  constructor(public code: PlaceProviderErrorCode, public retryable: boolean, public status?: number, cause?: unknown) {
    super(code, { cause });
    this.name = 'PlaceProviderError';
  }
}

export class UnconfiguredPlaceProvider implements PlaceSearchProvider {
  private unavailable(): never { throw new PlaceProviderError('unavailable', true); }
  async search(_input: PlaceSearchInput): Promise<VerifiedPlace[]> { return this.unavailable(); }
  async getPlace(_placeId: string): Promise<VerifiedPlace | null> { return this.unavailable(); }
}

const googlePlaceSchema = z.object({
  id: z.string().min(1),
  displayName: z.object({ text: z.string().min(1) }),
  formattedAddress: z.string().min(1),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  primaryType: z.string().optional(),
  types: z.array(z.string()).optional(),
  addressComponents: z.array(z.object({ longText: z.string(), types: z.array(z.string()) })).optional(),
});
const searchResponseSchema = z.object({ places: z.array(googlePlaceSchema).optional().default([]) });

const typeCategories: Record<string, TravelBlockCategory> = {
  restaurant: 'food', meal_takeaway: 'food', meal_delivery: 'food', bakery: 'food', food: 'food',
  cafe: 'cafe', coffee_shop: 'cafe',
  lodging: 'stay', hotel: 'stay', motel: 'stay', hostel: 'stay', resort_hotel: 'stay', bed_and_breakfast: 'stay',
  tourist_attraction: 'sightseeing', museum: 'sightseeing', art_gallery: 'sightseeing', historical_landmark: 'sightseeing', park: 'sightseeing',
  amusement_park: 'activity', zoo: 'activity', aquarium: 'activity', spa: 'activity', stadium: 'activity',
  airport: 'transport', train_station: 'transport', bus_station: 'transport', subway_station: 'transport', transit_station: 'transport', ferry_terminal: 'transport',
};

export function mapGooglePlaceCategory(primaryType?: string, types: string[] = []): TravelBlockCategory {
  for (const type of [primaryType, ...types]) if (type && typeCategories[type]) return typeCategories[type];
  return 'sightseeing';
}

export function buildGooglePlacesTextQuery(input: PlaceSearchInput): string {
  const parsed = PlaceSearchInputSchema.parse(input);
  return [parsed.query, parsed.category, parsed.city, parsed.region]
    .filter((part, index, all): part is string => Boolean(part) && all.indexOf(part) === index)
    .join(', ');
}

export interface GooglePlacesProviderOptions { apiKey: string; timeoutMs?: number; fetch?: typeof fetch }
const searchFields = 'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.addressComponents';
const detailsFields = 'id,displayName,formattedAddress,location,primaryType,types,addressComponents';

export class GooglePlacesProvider implements PlaceSearchProvider {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  constructor(private readonly options: GooglePlacesProviderOptions) {
    if (!options.apiKey) throw new PlaceProviderError('auth', false);
    this.fetcher = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async search(input: PlaceSearchInput): Promise<VerifiedPlace[]> {
    const parsed = PlaceSearchInputSchema.parse(input);
    const body = await this.request('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST', body: JSON.stringify({ textQuery: buildGooglePlacesTextQuery(parsed), pageSize: 10 }), fieldMask: searchFields,
    });
    let places: z.infer<typeof googlePlaceSchema>[];
    try { places = searchResponseSchema.parse(body).places; } catch (error) { throw new PlaceProviderError('invalid_response', false, undefined, error); }
    return places.map((place) => this.map(place, parsed));
  }

  async getPlace(placeId: string): Promise<VerifiedPlace | null> {
    const id = z.string().trim().min(1).max(200).parse(placeId);
    try {
      const body = await this.request(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, { method: 'GET', fieldMask: detailsFields });
      return this.map(googlePlaceSchema.parse(body));
    } catch (error) {
      if (error instanceof PlaceProviderError && error.code === 'not_found') return null;
      if (error instanceof z.ZodError) throw new PlaceProviderError('invalid_response', false, undefined, error);
      throw error;
    }
  }

  private map(place: z.infer<typeof googlePlaceSchema>, context?: PlaceSearchInput): VerifiedPlace {
    const component = (type: string) => place.addressComponents?.find((item) => item.types.includes(type))?.longText ?? '';
    return VerifiedPlaceSchema.parse({
      provider: 'google', providerPlaceId: place.id, name: place.displayName.text, formattedAddress: place.formattedAddress,
      latitude: place.location.latitude, longitude: place.location.longitude,
      category: mapGooglePlaceCategory(place.primaryType, place.types), city: context?.city ?? (component('locality') || component('administrative_area_level_2')), region: context?.region ?? component('administrative_area_level_1'),
    });
  }

  private async request(url: string, init: RequestInit & { fieldMask: string }): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(url, { ...init, signal: controller.signal, headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': this.options.apiKey, 'X-Goog-FieldMask': init.fieldMask } });
      if (!response.ok) throw classifyPlaceResponse(response.status);
      try { return await response.json(); } catch (error) { throw new PlaceProviderError('invalid_response', false, response.status, error); }
    } catch (error) {
      if (error instanceof PlaceProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new PlaceProviderError('timeout', true, undefined, error);
      throw new PlaceProviderError('network', true, undefined, error);
    } finally { clearTimeout(timer); }
  }
}

function classifyPlaceResponse(status: number): PlaceProviderError {
  if (status === 429) return new PlaceProviderError('rate_limit', true, status);
  if ([500, 502, 503, 504].includes(status)) return new PlaceProviderError('unavailable', true, status);
  if ([401, 403].includes(status)) return new PlaceProviderError('auth', false, status);
  if (status === 404) return new PlaceProviderError('not_found', false, status);
  return new PlaceProviderError('bad_request', false, status);
}

