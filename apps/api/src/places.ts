import { z } from 'zod';
import { PlaceSearchInputSchema, VerifiedPlaceSchema, type PlaceSearchInput, type TravelBlockCategory, type VerifiedPlace } from '@travel-blocks/shared';
import type { OpeningHoursBusinessStatus, OpeningHoursDataQualityFlag, OpeningHoursPeriod, OpeningHoursSchedule, PlaceOpeningHoursSnapshot } from '@travel-blocks/domain';

export interface PlaceSearchProvider { search(input: PlaceSearchInput): Promise<VerifiedPlace[]>; getPlace(placeId: string): Promise<VerifiedPlace | null>; }
export interface PlaceOpeningHoursProvider { getOpeningHours(placeId: string): Promise<PlaceOpeningHoursSnapshot | null>; }
export type PlaceProviderErrorCode = 'rate_limit' | 'unavailable' | 'timeout' | 'auth' | 'bad_request' | 'not_found' | 'network' | 'invalid_response';
export class PlaceProviderError extends Error {
  constructor(public code: PlaceProviderErrorCode, public retryable: boolean, public status?: number, cause?: unknown) { super(code, { cause }); this.name = 'PlaceProviderError'; }
}
export class UnconfiguredPlaceProvider implements PlaceSearchProvider {
  private unavailable(): never { throw new PlaceProviderError('unavailable', true); }
  async search(_input: PlaceSearchInput): Promise<VerifiedPlace[]> { return this.unavailable(); }
  async getPlace(_placeId: string): Promise<VerifiedPlace | null> { return this.unavailable(); }
}
const googlePlaceSchema = z.object({
  id: z.string().min(1), displayName: z.object({ text: z.string().min(1) }), formattedAddress: z.string().min(1),
  location: z.object({ latitude: z.number(), longitude: z.number() }), primaryType: z.string().optional(), types: z.array(z.string()).optional(),
  addressComponents: z.array(z.object({ longText: z.string().default(''), types: z.array(z.string()).default([]) })).optional(),
});
const searchResponseSchema = z.object({ places: z.array(googlePlaceSchema).optional().default([]) });
const typeCategories: Record<string, TravelBlockCategory> = {
  restaurant: 'food', meal_takeaway: 'food', meal_delivery: 'food', bakery: 'food', food: 'food', cafe: 'cafe', coffee_shop: 'cafe',
  lodging: 'stay', hotel: 'stay', motel: 'stay', hostel: 'stay', resort_hotel: 'stay', bed_and_breakfast: 'stay',
  tourist_attraction: 'sightseeing', museum: 'sightseeing', art_gallery: 'sightseeing', historical_landmark: 'sightseeing', park: 'sightseeing',
  amusement_park: 'activity', zoo: 'activity', aquarium: 'activity', spa: 'activity', stadium: 'activity',
  airport: 'transport', train_station: 'transport', bus_station: 'transport', subway_station: 'transport', transit_station: 'transport', ferry_terminal: 'transport',
};
export function mapGooglePlaceCategory(primaryType?: string, types: string[] = []): TravelBlockCategory { for (const type of [primaryType, ...types]) if (type && typeCategories[type]) return typeCategories[type]; return 'sightseeing'; }
export function buildGooglePlacesTextQuery(input: PlaceSearchInput): string { const parsed = PlaceSearchInputSchema.parse(input); return [parsed.query, parsed.category, parsed.city, parsed.region].filter((part, index, all): part is string => Boolean(part) && all.indexOf(part) === index).join(', '); }

export interface GooglePlacesProviderOptions { apiKey: string; timeoutMs?: number; fetch?: typeof fetch }
const searchFields = 'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.addressComponents';
const detailsFields = 'id,displayName,formattedAddress,location,primaryType,types,addressComponents';
const openingHoursFields = 'id,businessStatus,timeZone,currentOpeningHours,regularOpeningHours';

export class GooglePlacesProvider implements PlaceSearchProvider, PlaceOpeningHoursProvider {
  private readonly fetcher: typeof fetch; private readonly timeoutMs: number;
  constructor(private readonly options: GooglePlacesProviderOptions) { if (!options.apiKey) throw new PlaceProviderError('auth', false); this.fetcher = options.fetch ?? fetch; this.timeoutMs = options.timeoutMs ?? 10_000; }
  async search(input: PlaceSearchInput): Promise<VerifiedPlace[]> {
    const parsed = PlaceSearchInputSchema.parse(input);
    const body = await this.request('https://places.googleapis.com/v1/places:searchText', { method: 'POST', body: JSON.stringify({ textQuery: buildGooglePlacesTextQuery(parsed), pageSize: 10, languageCode: 'ko' }), fieldMask: searchFields });
    try { return searchResponseSchema.parse(body).places.map((place) => this.map(place, parsed)); } catch (error) { throw new PlaceProviderError('invalid_response', false, undefined, error); }
  }
  async getPlace(placeId: string): Promise<VerifiedPlace | null> {
    const id = z.string().trim().min(1).max(200).parse(placeId);
    try { const body = await this.request(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=ko`, { method: 'GET', fieldMask: detailsFields }); return this.map(googlePlaceSchema.parse(body)); }
    catch (error) { if (error instanceof PlaceProviderError && error.code === 'not_found') return null; if (error instanceof z.ZodError) throw new PlaceProviderError('invalid_response', false, undefined, error); throw error; }
  }
  async getOpeningHours(placeId: string): Promise<PlaceOpeningHoursSnapshot | null> {
    const id = z.string().trim().min(1).max(200).parse(placeId);
    try { const body = await this.request(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=ko`, { method: 'GET', fieldMask: openingHoursFields }); return parseGooglePlaceOpeningHours(body); }
    catch (error) { if (error instanceof PlaceProviderError && error.code === 'not_found') return null; throw error; }
  }
  private map(place: z.infer<typeof googlePlaceSchema>, context?: PlaceSearchInput): VerifiedPlace {
    const component = (type: string) => place.addressComponents?.find((item) => item.longText && item.types.includes(type))?.longText ?? '';
    return VerifiedPlaceSchema.parse({ provider: 'google', providerPlaceId: place.id, name: place.displayName.text, formattedAddress: place.formattedAddress, latitude: place.location.latitude, longitude: place.location.longitude, category: mapGooglePlaceCategory(place.primaryType, place.types), city: context?.city ?? (component('locality') || component('administrative_area_level_2')), region: context?.region ?? component('administrative_area_level_1') });
  }
  private async request(url: string, init: RequestInit & { fieldMask: string }): Promise<unknown> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(url, { ...init, signal: controller.signal, headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': this.options.apiKey, 'X-Goog-FieldMask': init.fieldMask } });
      if (!response.ok) throw classifyPlaceResponse(response.status);
      try { return await response.json(); } catch (error) { throw new PlaceProviderError('invalid_response', false, response.status, error); }
    } catch (error) { if (error instanceof PlaceProviderError) throw error; if (error instanceof Error && error.name === 'AbortError') throw new PlaceProviderError('timeout', true, undefined, error); throw new PlaceProviderError('network', true, undefined, error); }
    finally { clearTimeout(timer); }
  }
}

export function parseGooglePlaceOpeningHours(raw: unknown, retrievedAt = new Date().toISOString()): PlaceOpeningHoursSnapshot {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const flags = new Set<OpeningHoursDataQualityFlag>(); const timeZone = typeof value.timeZone === 'string' && value.timeZone ? value.timeZone : undefined;
  if (!timeZone) flags.add('timezone_missing');
  const currentHours = normalizeSchedule(value.currentOpeningHours, flags, true); const regularHours = normalizeSchedule(value.regularOpeningHours, flags, false);
  if (!currentHours && !regularHours) flags.add('opening_hours_missing');
  if (!currentHours && regularHours) { flags.add('regular_hours_only'); flags.add('special_hours_unknown'); }
  return { provider: 'google', providerPlaceId: typeof value.id === 'string' ? value.id : '', source: 'google_places', retrievedAt, businessStatus: normalizeBusinessStatus(value.businessStatus), timeZone, currentHours, regularHours, dataQualityFlags: [...flags] };
}
function normalizeBusinessStatus(value: unknown): OpeningHoursBusinessStatus | undefined { if (value === 'OPERATIONAL') return 'operational'; if (value === 'CLOSED_TEMPORARILY') return 'temporarily_closed'; if (value === 'CLOSED_PERMANENTLY') return 'permanently_closed'; if (value === 'FUTURE_OPENING') return 'future_opening'; return value === undefined ? undefined : 'unknown'; }
function normalizeSchedule(raw: unknown, flags: Set<OpeningHoursDataQualityFlag>, current: boolean): OpeningHoursSchedule | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const periodsValue = (raw as Record<string, unknown>).periods; if (!Array.isArray(periodsValue)) { flags.add(current ? 'current_hours_unavailable' : 'opening_hours_missing'); return undefined; }
  const periods: OpeningHoursPeriod[] = [];
  for (const item of periodsValue) {
    if (!item || typeof item !== 'object') { flags.add('invalid_opening_period'); continue; }
    const period = item as Record<string, unknown>; const open = period.open && typeof period.open === 'object' ? period.open as Record<string, unknown> : undefined; const close = period.close && typeof period.close === 'object' ? period.close as Record<string, unknown> : undefined;
    const openDay = typeof open?.day === 'number' ? open.day : undefined; const openTime = normalizeGoogleTime(open?.time);
    if (openDay === undefined || openDay < 0 || openDay > 6 || !openTime) { flags.add('invalid_opening_period'); continue; }
    const closeDay = typeof close?.day === 'number' ? close.day : undefined; const closeTime = close ? normalizeGoogleTime(close.time) : undefined;
    if (close && (closeDay === undefined || closeDay < 0 || closeDay > 6 || !closeTime)) { flags.add('invalid_opening_period'); continue; }
    periods.push({ openDay, openTime, ...(closeDay === undefined ? {} : { closeDay }), ...(closeTime ? { closeTime } : {}), ...(typeof open?.date === 'string' ? { openDate: open.date } : {}), ...(typeof close?.date === 'string' ? { closeDate: close.date } : {}) });
  }
  return { periods, coverageStart: periodDate(periods, 'openDate', false), coverageEnd: periodDate(periods, 'closeDate', true) };
}
function normalizeGoogleTime(value: unknown): string | undefined { return typeof value === 'string' && /^\d{4}$/.test(value) ? `${value.slice(0, 2)}:${value.slice(2)}` : undefined; }
function periodDate(periods: readonly OpeningHoursPeriod[], key: 'openDate' | 'closeDate', max: boolean): string | undefined { const values = periods.flatMap((period) => period[key] ? [period[key] as string] : []).sort(); return values.length ? values[max ? values.length - 1 : 0] : undefined; }
function classifyPlaceResponse(status: number): PlaceProviderError { if (status === 429) return new PlaceProviderError('rate_limit', true, status); if ([500, 502, 503, 504].includes(status)) return new PlaceProviderError('unavailable', true, status); if ([401, 403].includes(status)) return new PlaceProviderError('auth', false, status); if (status === 404) return new PlaceProviderError('not_found', false, status); return new PlaceProviderError('bad_request', false, status); }

