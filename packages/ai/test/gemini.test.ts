import { describe, expect, it } from 'vitest';
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
