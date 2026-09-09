import { describe, expect, it, vi } from 'vitest';
import { GenerateTripResponseSchema, TravelIntentSchema, PlaceRankingResultSchema, type PlaceRankingInput } from '@travel-blocks/shared';
import { AiProviderError, GeminiTravelAiProvider } from '../src/index.js';
import { toGeminiResponseJsonSchema } from '../src/gemini/structuredOutput.js';

const validPlan = { trip: { name: '서울', country: '대한민국', city: '서울', duration: '1일', budget: '', travelers: '', style: '', description: '' }, days: [], connections: [] };
const candidate = { candidateId: 'google:p1', provider: 'google', providerPlaceId: 'p1', name: '실제 장소', formattedAddress: '서울', latitude: 1, longitude: 2, category: 'sightseeing' as const, city: '서울', region: '' };
const rankingInput: PlaceRankingInput = { trip: validPlan.trip, day: { id: 'd1', dayNumber: 1, title: '첫날', blocks: [] }, existingPlaces: [], candidates: [candidate] };
const gemini = (value: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof value === 'string' ? value : JSON.stringify(value) }] } }] }), { status: 200 });

describe('Gemini structured outputs', () => {
  it('Zod schema를 Gemini 지원 JSON Schema subset으로 변환한다', () => {
    const schema = toGeminiResponseJsonSchema(GenerateTripResponseSchema);
    expect(schema).toMatchObject({ type: 'object', properties: { trip: { type: 'object' }, days: { type: 'array' } } });
    expect(JSON.stringify(schema)).not.toContain('minLength');
    expect(JSON.stringify(schema)).not.toContain('default');
  });

  it('changes only the trip blocks array limit and keeps the original schema intact', () => {
    const original: any = toGeminiResponseJsonSchema(GenerateTripResponseSchema);
    const expected = structuredClone(original);
    delete expected.properties.days.items.properties.blocks.maxItems;
    const adapted = toGeminiResponseJsonSchema(GenerateTripResponseSchema, 'travel-plan');
    expect(adapted).toEqual(expected);
    expect(original.properties.days.items.properties.blocks.maxItems).toBe(100);
    expect(toGeminiResponseJsonSchema(GenerateTripResponseSchema)).toEqual(original);
  });

  it('keeps intent and ranking array limits', () => {
    const intent: any = toGeminiResponseJsonSchema(TravelIntentSchema);
    const ranking: any = toGeminiResponseJsonSchema(PlaceRankingResultSchema);
    expect(intent.properties.preferences.maxItems).toBe(20);
    expect(intent.properties.avoidances.maxItems).toBe(20);
    expect(intent.properties.requestedCategories.maxItems).toBe(6);
    expect(ranking.properties.selections.maxItems).toBe(5);
  });

  it.each([
    ['generateTrip', validPlan],
    ['planTrip', validPlan],
    ['extractIntent', {}],
    ['analyzeText', validPlan],
    ['rankPlaces', { selections: [{ candidateId: 'google:p1', reason: '적합함' }] }],
  ])('%s 요청에 responseJsonSchema를 전달한다', async (method, output) => {
    let requestBody: any;
    const provider = new GeminiTravelAiProvider({ apiKey: 'test', fetch: vi.fn(async (_url, init) => { requestBody = JSON.parse(String(init?.body)); return gemini(output); }) });
    if (method === 'generateTrip') await provider.generateTrip({ prompt: '서울' });
    else if (method === 'planTrip') await provider.planTrip({ prompt: '서울', intent: { preferences: [], avoidances: [], requestedCategories: [] }, candidates: [] });
    else if (method === 'extractIntent') await provider.extractIntent({ prompt: '서울' });
    else if (method === 'analyzeText') await provider.analyzeText({ content: '서울 여행 기록' });
    else await provider.rankPlaces(rankingInput);
    expect(requestBody.generationConfig.responseMimeType).toBe('application/json');
    expect(requestBody.generationConfig.responseJsonSchema).toMatchObject({ type: 'object' });
    const expected = method === 'rankPlaces' ? toGeminiResponseJsonSchema(PlaceRankingResultSchema)
      : method === 'extractIntent' ? toGeminiResponseJsonSchema(TravelIntentSchema)
      : toGeminiResponseJsonSchema(GenerateTripResponseSchema, 'travel-plan');
    expect(requestBody.generationConfig.responseJsonSchema).toEqual(expected);
  });

  it.each([
    ['malformed JSON', '{bad'],
    ['schema mismatch', { unexpected: true }],
  ])('%s를 invalid_output으로 차단한다', async (_name, output) => {
    const provider = new GeminiTravelAiProvider({ apiKey: 'test', fetch: async () => gemini(output) });
    await expect(provider.generateTrip({ prompt: '서울' })).rejects.toMatchObject({ code: 'invalid_output' });
  });

  it.each([
    ['unknown candidate', { selections: [{ candidateId: 'invented', reason: '가짜' }] }],
    ['duplicate candidate', { selections: [{ candidateId: 'google:p1', reason: '첫째' }, { candidateId: 'google:p1', reason: '둘째' }] }],
  ])('%s를 차단한다', async (_name, output) => {
    const provider = new GeminiTravelAiProvider({ apiKey: 'test', fetch: async () => gemini(output) });
    await expect(provider.rankPlaces(rankingInput)).rejects.toBeInstanceOf(AiProviderError);
  });

  it('너무 많은 선택을 차단하고 empty selection은 허용한다', async () => {
    const tooMany = { selections: Array.from({ length: 6 }, (_, index) => ({ candidateId: `p${index}`, reason: 'x' })) };
    await expect(new GeminiTravelAiProvider({ apiKey: 'test', fetch: async () => gemini(tooMany) }).rankPlaces(rankingInput)).rejects.toMatchObject({ code: 'invalid_output' });
    await expect(new GeminiTravelAiProvider({ apiKey: 'test', fetch: async () => gemini({ selections: [] }) }).rankPlaces(rankingInput)).resolves.toEqual({ selections: [] });
  });
});
