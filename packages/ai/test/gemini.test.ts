import { describe, expect, it, vi } from 'vitest';
import { AiProviderError, GeminiTravelAiProvider } from '../src/index.js';
const valid={trip:{name:'서울',country:'대한민국',city:'서울',duration:'1일',budget:'',travelers:'',style:'',description:''},days:[],connections:[]};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const gemini=(text:string)=>({candidates:[{content:{parts:[{text}]}}]});
describe('Gemini adapter',()=>{
  it('structured output을 검증한다',async()=>expect(new GeminiTravelAiProvider({apiKey:'test',fetch:async()=>response(gemini(JSON.stringify(valid)))}).generateTrip({prompt:'서울'})).resolves.toEqual(valid));
  it('malformed output을 차단한다',async()=>expect(new GeminiTravelAiProvider({apiKey:'test',fetch:async()=>response(gemini('{bad'))}).generateTrip({prompt:'서울'})).rejects.toMatchObject({code:'invalid_output'}));
  it.each([[429,'rate_limit'],[503,'unavailable']])('%s 오류를 분류한다',async(status,code)=>expect(new GeminiTravelAiProvider({apiKey:'test',maxRetries:0,fetch:async()=>response({},status as number)}).generateTrip({prompt:'서울'})).rejects.toMatchObject({code}));
  it('빈 결과를 차단한다',async()=>expect(new GeminiTravelAiProvider({apiKey:'test',fetch:async()=>response({candidates:[]})}).generateTrip({prompt:'서울'})).rejects.toBeInstanceOf(AiProviderError));
  it('timeout을 분류한다',async()=>expect(new GeminiTravelAiProvider({apiKey:'test',timeoutMs:1,maxRetries:0,fetch:(_,init)=>new Promise((_,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('x','AbortError'))))}).generateTrip({prompt:'서울'})).rejects.toMatchObject({code:'timeout'}));
});


describe('Gemini retry policy', () => {
  it('retries 429 using Retry-After before a successful response', async () => {
    let attempts = 0;
    const delays: number[] = [];
    const provider = new GeminiTravelAiProvider({
      apiKey: 'test', maxRetries: 1, wait: async (ms) => { delays.push(ms); },
      fetch: async () => ++attempts === 1
        ? new Response('{}', { status: 429, headers: { 'Retry-After': '3' } })
        : response(gemini(JSON.stringify(valid))),
    });
    await expect(provider.generateTrip({ prompt: '서울' })).resolves.toEqual(valid);
    expect(attempts).toBe(2);
    expect(delays).toEqual([3_000]);
  });

  it('uses bounded exponential backoff and jitter when Retry-After is absent', async () => {
    let attempts = 0;
    const delays: number[] = [];
    const provider = new GeminiTravelAiProvider({
      apiKey: 'test', maxRetries: 2, random: () => 0, wait: async (ms) => { delays.push(ms); },
      fetch: async () => ++attempts < 3 ? response({}, 429) : response(gemini(JSON.stringify(valid))),
    });
    await expect(provider.generateTrip({ prompt: '서울' })).resolves.toEqual(valid);
    expect(delays).toEqual([800, 1_600]);
  });

  it('returns rate_limit and records telemetry after the retry limit', async () => {
    const events: any[] = [];
    const fetcher = vi.fn(async () => response({}, 429));
    const provider = new GeminiTravelAiProvider({ apiKey: 'test', maxRetries: 1, wait: async () => undefined, observer: { record: (event) => events.push(event) }, fetch: fetcher });
    await expect(provider.generateTrip({ prompt: '서울' })).rejects.toMatchObject({ code: 'rate_limit', status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(events).toEqual([expect.objectContaining({ task: 'generate_trip', status: 'error', errorCode: 'rate_limit' })]);
  });

  it.each([400, 401, 403])('does not retry non-retryable %i responses', async (status) => {
    const fetcher = vi.fn(async () => response({}, status));
    await expect(new GeminiTravelAiProvider({ apiKey: 'test', maxRetries: 2, wait: async () => undefined, fetch: fetcher }).generateTrip({ prompt: '서울' })).rejects.toBeInstanceOf(AiProviderError);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([500, 503])('keeps retrying retryable %i responses', async (status) => {
    let attempts = 0;
    const fetcher = vi.fn(async () => ++attempts === 1 ? response({}, status) : response(gemini(JSON.stringify(valid))));
    await expect(new GeminiTravelAiProvider({ apiKey: 'test', maxRetries: 1, wait: async () => undefined, fetch: fetcher }).generateTrip({ prompt: '서울' })).resolves.toEqual(valid);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
