import { describe, expect, it, vi } from 'vitest';
import { GeminiTravelAiProvider, type AiRunEvent } from '../src/index.js';

const validPlan = { trip: { name: '서울', country: '대한민국', city: '서울', duration: '1일', budget: '', travelers: '', style: '', description: '' }, days: [], connections: [] };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(status === 200 ? {
  candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
  usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 },
} : value), { status });

 describe('AI logical-operation observation', () => {
  it('records one successful run with task, model, latency and tokens', async () => {
    const events: AiRunEvent[] = [];
    const provider = new GeminiTravelAiProvider({ apiKey: 'x', model: 'planning', observer: { record: (event) => events.push(event) }, fetch: async () => response(validPlan) });
    await provider.generateTrip({ prompt: '서울' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: 'gemini', model: 'planning', task: 'generate_trip', status: 'success', inputTokens: 11, outputTokens: 7 });
    expect(events[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(Object.keys(events[0])).not.toEqual(expect.arrayContaining(['prompt', 'rawResponse', 'apiKey']));
  });

  it('records a failed logical run after retries with a known error code', async () => {
    const events: AiRunEvent[] = [];
    const fetcher = vi.fn(async () => response({}, 503));
    const provider = new GeminiTravelAiProvider({ apiKey: 'x', maxRetries: 1, observer: { record: (event) => events.push(event) }, fetch: fetcher });
    await expect(provider.analyzeText({ content: '서울' })).rejects.toMatchObject({ code: 'unavailable' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ task: 'analyze_text', status: 'error', errorCode: 'unavailable' });
  });

  it('does not fail a successful AI operation when the observer sink fails', async () => {
    const onObserverError = vi.fn();
    const provider = new GeminiTravelAiProvider({ apiKey: 'x', fetch: async () => response(validPlan), observer: { record: async () => { throw new Error('database unavailable'); } }, onObserverError });
    await expect(provider.generateTrip({ prompt: '서울' })).resolves.toEqual(validPlan);
    expect(onObserverError).toHaveBeenCalledOnce();
  });
});

describe('AI safe invalid-output diagnostics', () => {
  it.each([
    ['missing_text', { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] }, 'MAX_TOKENS'],
    ['json_parse', { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{raw-only-marker' }] } }] }, 'STOP'],
    ['schema_validation', { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ trip: {} }) }] } }] }, 'STOP'],
  ])('records %s without raw generated text', async (stage, body, finishReason) => {
    const events: AiRunEvent[] = [];
    const provider = new GeminiTravelAiProvider({ apiKey: 'x', observer: { record: (event) => events.push(event) }, fetch: async () => new Response(JSON.stringify(body)) });
    await expect(provider.generateTrip({ prompt: '서울' })).rejects.toMatchObject({ code: 'invalid_output' });
    expect(events).toEqual([expect.objectContaining({ task: 'generate_trip', status: 'error', errorCode: 'invalid_output', invalidOutputStage: stage, candidateCount: 1, finishReason })]);
    expect(JSON.stringify(events)).not.toContain('raw-only-marker');
  });
});

describe('task-specific Gemini timeouts (mock only)', () => {
  it('allows a long generate task to exceed the short timeout within the long timeout', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(() => new Promise<Response>((resolve) => setTimeout(() => resolve(response(validPlan)), 5)));
      const result = new GeminiTravelAiProvider({ apiKey: 'x', timeoutMs: 1, longTaskTimeoutMs: 40, maxRetries: 0, fetch: fetcher }).generateTrip({ prompt: '서울' });
      await vi.advanceTimersByTimeAsync(5);
      await expect(result).resolves.toEqual(validPlan);
      expect(fetcher).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
});

describe('long timeout retry policy (mock only)', () => {
  it.each([
    ['generate_trip', (provider: GeminiTravelAiProvider) => provider.generateTrip({ prompt: '서울' })],
    ['analyze_text', (provider: GeminiTravelAiProvider) => provider.analyzeText({ content: '부산 2박 3일 기록' })],
  ])('%s timeout uses one attempt and no retry', async (_task, run) => {
    vi.useFakeTimers();
    try {
      const events: AiRunEvent[] = []; const fetcher = vi.fn((_: unknown, init?: RequestInit) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))));
      const provider = new GeminiTravelAiProvider({ apiKey: 'x', timeoutMs: 1, longTaskTimeoutMs: 1, maxRetries: 2, observer: { record: (event) => events.push(event) }, fetch: fetcher });
      const result = run(provider); const assertion = expect(result).rejects.toMatchObject({ code: 'timeout' });
      await vi.advanceTimersByTimeAsync(1); await assertion;
      expect(fetcher).toHaveBeenCalledOnce();
      expect(events).toEqual([expect.objectContaining({ status: 'error', errorCode: 'timeout', providerAttempts: 1 })]);
    } finally { vi.useRealTimers(); }
  });
});

describe('short task retry policy (mock only)', () => {
  it('keeps bounded retry for rank_places', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn((_: unknown, init?: RequestInit) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))));
      const provider = new GeminiTravelAiProvider({ apiKey: 'x', timeoutMs: 1, longTaskTimeoutMs: 40, maxRetries: 1, wait: async () => undefined, fetch: fetcher });
      const result = provider.rankPlaces({ trip: validPlan.trip, day: { id: 'd1', dayNumber: 1, title: '첫날', blocks: [] }, existingPlaces: [], candidates: [{ candidateId: 'google:p1', provider: 'google', providerPlaceId: 'p1', name: '장소', formattedAddress: '서울', latitude: 1, longitude: 2, category: 'sightseeing', city: '서울', region: '' }] });
      const assertion = expect(result).rejects.toMatchObject({ code: 'timeout' });
      await vi.advanceTimersByTimeAsync(1); await Promise.resolve(); await vi.advanceTimersByTimeAsync(1); await assertion;
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
});


describe("extract_intent timeout policy (mock only)", () => {
  const validIntent = { destination: { city: "오사카" }, preferences: [], avoidances: [], requestedCategories: [] as const };

  it("allows an intent response after 15 seconds but before its 30-second timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(() => new Promise<Response>((resolve) => setTimeout(() => resolve(response(validIntent)), 20)));
      const result = new GeminiTravelAiProvider({ apiKey: "x", timeoutMs: 15, intentTimeoutMs: 30, maxRetries: 0, fetch: fetcher }).extractIntent({ prompt: "오사카" });
      await vi.advanceTimersByTimeAsync(20);
      await expect(result).resolves.toEqual(validIntent);
      expect(fetcher).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });

  it("does not retry an extract_intent client timeout", async () => {
    vi.useFakeTimers();
    try {
      const events: AiRunEvent[] = [];
      const fetcher = vi.fn((_: unknown, init?: RequestInit) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("x", "AbortError")))));
      const provider = new GeminiTravelAiProvider({ apiKey: "x", intentTimeoutMs: 30, maxRetries: 2, observer: { record: (event) => events.push(event) }, fetch: fetcher });
      const result = provider.extractIntent({ prompt: "오사카" });
      const assertion = expect(result).rejects.toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(30);
      await assertion;
      expect(fetcher).toHaveBeenCalledOnce();
      expect(events).toEqual([expect.objectContaining({ task: "extract_intent", status: "error", errorCode: "timeout", providerAttempts: 1 })]);
    } finally { vi.useRealTimers(); }
  });

  it("keeps Retry-After retry behavior for extract_intent 429 responses", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const provider = new GeminiTravelAiProvider({ apiKey: "x", intentTimeoutMs: 30, maxRetries: 1, wait: async (ms) => { delays.push(ms); }, fetch: async () => ++attempts === 1 ? new Response("{}", { status: 429, headers: { "Retry-After": "1" } }) : response(validIntent) });
    await expect(provider.extractIntent({ prompt: "오사카" })).resolves.toEqual(validIntent);
    expect(attempts).toBe(2);
    expect(delays).toEqual([1_000]);
  });

  it("keeps bounded retry behavior for extract_intent 503 responses", async () => {
    let attempts = 0;
    const provider = new GeminiTravelAiProvider({ apiKey: "x", intentTimeoutMs: 30, maxRetries: 1, wait: async () => undefined, fetch: async () => ++attempts === 1 ? response({}, 503) : response(validIntent) });
    await expect(provider.extractIntent({ prompt: "오사카" })).resolves.toEqual(validIntent);
    expect(attempts).toBe(2);
  });
});


describe("analyze-text source-only place normalization (mock only)", () => {
  const sourceOnlyPlan = () => ({ ...validPlan, days: [{ id: "day-1", dayNumber: 1, title: "첫날", blocks: [{ id: "block-1", title: "출처 장소", category: "sightseeing", priceLevel: "low", place: { provider: "source", providerPlaceId: "unverified", verified: false } }] }] });

  it("omits unverified source-only place markers before analyze-text schema validation", async () => {
    const provider = new GeminiTravelAiProvider({ apiKey: "x", fetch: async () => response(sourceOnlyPlan()) });
    const result = await provider.analyzeText({ content: "부산 여행 기록" });
    expect(result.days[0].blocks[0].place).toBeUndefined();
  });

  it("retains Full Generation schema validation for an unverified place marker", async () => {
    const provider = new GeminiTravelAiProvider({ apiKey: "x", fetch: async () => response(sourceOnlyPlan()) });
    await expect(provider.generateTrip({ prompt: "오사카" })).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("records bounded per-attempt error codes without raw output", async () => {
    const events: AiRunEvent[] = [];
    let attempts = 0;
    const provider = new GeminiTravelAiProvider({ apiKey: "x", maxRetries: 1, wait: async () => undefined, observer: { record: (event) => events.push(event) }, fetch: async () => ++attempts === 1 ? response({}, 503) : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{attempt-raw-only-marker" }] } }] })) });
    await expect(provider.analyzeText({ content: "부산 여행 기록" })).rejects.toMatchObject({ code: "invalid_output" });
    expect(events).toEqual([expect.objectContaining({ task: "analyze_text", providerAttempts: 2, attemptErrorCodes: ["unavailable", "invalid_output"] })]);
    expect(JSON.stringify(events)).not.toContain("attempt-raw-only-marker");
  });
});
