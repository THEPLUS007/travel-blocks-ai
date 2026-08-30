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
