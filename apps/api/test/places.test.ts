import { describe, expect, it, vi } from 'vitest';
import { GooglePlacesProvider, PlaceProviderError, UnconfiguredPlaceProvider, buildGooglePlacesTextQuery, mapGooglePlaceCategory } from '../src/places.js';

const googlePlace = { id: 'place-1', displayName: { text: '경복궁' }, formattedAddress: '서울특별시 종로구', location: { latitude: 37.5796, longitude: 126.977 }, primaryType: 'tourist_attraction', types: ['museum'], addressComponents: [{ longText: '서울', types: ['locality'] }, { longText: '서울특별시', types: ['administrative_area_level_1'] }] };
const response = (body: unknown, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('GooglePlacesProvider', () => {
  it('Text Search를 최소 field mask로 호출하고 VerifiedPlace로 변환한다', async () => {
    let requestedUrl: string | URL | Request | undefined;
    let requestedInit: RequestInit | undefined;
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => { requestedUrl = url; requestedInit = init; return response({ places: [googlePlace] }); });
    const result = await new GooglePlacesProvider({ apiKey: 'server-key', fetch: fetcher }).search({ query: '경복궁', city: '서울', region: '종로구', category: '관광' });
    expect(result).toEqual([{ provider: 'google', providerPlaceId: 'place-1', name: '경복궁', formattedAddress: '서울특별시 종로구', latitude: 37.5796, longitude: 126.977, category: 'sightseeing', city: '서울', region: '종로구' }]);
    const url = requestedUrl;
    const init = requestedInit;
    expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(init?.headers).toMatchObject({ 'X-Goog-Api-Key': 'server-key', 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.addressComponents' });
    expect(JSON.parse(String(init?.body))).toEqual({ textQuery: '경복궁, 관광, 서울, 종로구', pageSize: 10 });
  });

  it('Place ID로 Details를 조회하고 Text Search를 반복하지 않는다', async () => {
    let requestedUrl: string | URL | Request | undefined;
    let requestedInit: RequestInit | undefined;
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => { requestedUrl = url; requestedInit = init; return response({ ...googlePlace, primaryType: 'restaurant' }); });
    const result = await new GooglePlacesProvider({ apiKey: 'key', fetch: fetcher }).getPlace('place/with space');
    expect(result).toMatchObject({ providerPlaceId: 'place-1', category: 'food', city: '서울', region: '서울특별시' });
    expect(requestedUrl).toBe('https://places.googleapis.com/v1/places/place%2Fwith%20space');
    expect(requestedInit?.method).toBe('GET');
  });

  it('빈 검색 결과는 정상 빈 배열이다', async () => expect(new GooglePlacesProvider({ apiKey: 'key', fetch: async () => response({}) }).search({ query: '없음' })).resolves.toEqual([]));
  it.each([[400, 'bad_request', false], [401, 'auth', false], [403, 'auth', false], [429, 'rate_limit', true], [503, 'unavailable', true]])('%s 응답을 분류한다', async (status, code, retryable) => {
    await expect(new GooglePlacesProvider({ apiKey: 'key', fetch: async () => response({}, status as number) }).search({ query: '서울' })).rejects.toMatchObject({ code, retryable });
  });
  it('404 Details는 null이다', async () => expect(new GooglePlacesProvider({ apiKey: 'key', fetch: async () => response({}, 404) }).getPlace('missing')).resolves.toBeNull());
  it('invalid JSON과 malformed shape를 구분한다', async () => {
    await expect(new GooglePlacesProvider({ apiKey: 'key', fetch: async () => response('{bad') }).search({ query: '서울' })).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(new GooglePlacesProvider({ apiKey: 'key', fetch: async () => response({ places: [{ id: 'x' }] }) }).search({ query: '서울' })).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('timeout을 분류한다', async () => {
    const provider = new GooglePlacesProvider({ apiKey: 'key', timeoutMs: 1, fetch: (_, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))) });
    await expect(provider.search({ query: '서울' })).rejects.toMatchObject({ code: 'timeout', retryable: true });
  });
  it('API key 미설정은 auth 오류다', () => expect(() => new GooglePlacesProvider({ apiKey: '' })).toThrow(PlaceProviderError));
  it('query와 category mapping은 deterministic하다', () => {
    expect(buildGooglePlacesTextQuery({ query: '카페', city: '서울', region: '서울', category: 'cafe' })).toBe('카페, cafe, 서울');
    expect(mapGooglePlaceCategory('cafe')).toBe('cafe');
    expect(mapGooglePlaceCategory('hotel')).toBe('stay');
    expect(mapGooglePlaceCategory('unknown')).toBe('sightseeing');
  });
  it('미설정 provider는 Mock 없이 unavailable 오류를 반환한다', async () => expect(new UnconfiguredPlaceProvider().search({ query: '서울' })).rejects.toMatchObject({ code: 'unavailable' }));
});
