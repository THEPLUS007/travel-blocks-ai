import { describe, expect, it } from 'vitest';
import { TestAiProvider, TestPlaceProvider } from '@travel-blocks/test-fixtures';
import { buildApp } from '../src/app.js';
import { TravelSourcePipeline } from '../src/sources.js';
import type { TripRepository } from '../src/repository.js';
const createApp=()=>buildApp({repository:{} as TripRepository,auth:{authenticate:async()=>({userId:'u'})},ai:new TestAiProvider(),places:new TestPlaceProvider(),sources:new TravelSourcePipeline()});
describe('source analysis API',()=>{
  it('plain text를 server pipeline으로 normalize해 분석한다',async()=>{const app=await createApp();const result=await app.inject({method:'POST',url:'/api/v1/ai/analyze-source',payload:{input:'  서울   여행  '}});expect(result.statusCode).toBe(200);expect(result.json().trip.name).toBeTruthy();await app.close()});
  it('YouTube를 explicit unsupported error로 반환한다',async()=>{const app=await createApp();const result=await app.inject({method:'POST',url:'/api/v1/ai/analyze-source',payload:{input:'https://youtu.be/test'}});expect(result.statusCode).toBe(400);expect(result.json()).toMatchObject({error:{code:'SOURCE_UNSUPPORTED',retryable:false}});expect(result.json().error.requestId).toBeTruthy();await app.close()});
});
