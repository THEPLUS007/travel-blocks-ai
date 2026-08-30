import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import {
  AnalyzeTextRequestSchema,
  AnalyzeSourceRequestSchema,
  CreateTripRequestSchema,
  GenerateTripRequestSchema,
  PlaceSearchInputSchema,
  RecommendationRequestSchema,
  UpdateTripRequestSchema,
} from '@travel-blocks/shared';
import { AiProviderError, type TravelAiProvider } from '@travel-blocks/ai';
import type { AuthProvider } from './auth.js';
import { PlaceProviderError, type PlaceSearchProvider } from './places.js';
import { buildTripPlanningInput, groundPlanWithCandidates, retrieveIntentCandidates } from './planning.js';
import { buildPlaceRankingInput, retrievePlaceCandidates, selectedPlacesToBlocks } from './recommendations.js';
import { SourcePipelineError, TravelSourcePipeline } from './sources.js';
import type { TripRepository } from './repository.js';

export interface AppDependencies {
  repository: TripRepository;
  auth: AuthProvider;
  ai: TravelAiProvider;
  places: PlaceSearchProvider;
  sources?: TravelSourcePipeline;
  readiness?: () => Promise<void>;
  logger?: boolean;
  trustProxy?: boolean;
}

const idSchema = z.string().uuid();
const errorStatus = (code: string) => code === 'NOT_FOUND' ? 404 : code === 'VERSION_CONFLICT' ? 409 : code === 'AI_PROVIDER_UNAVAILABLE' ? 503 : code === 'INVALID_REQUEST' ? 400 : 500;

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logger ?? false,
    trustProxy: deps.trustProxy ?? false,
    bodyLimit: 64 * 1024,
    requestTimeout: 30_000,
    genReqId: () => randomUUID(),
  });
  await app.register(cookie);
  await app.register(helmet);
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  const fail = (reply: any, request: any, code: string, message: string, retryable = false, status = errorStatus(code)) =>
    reply.code(status).send({ error: { code, message, retryable, requestId: request.id } });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) return fail(reply, request, 'INVALID_REQUEST', '요청 형식이 올바르지 않습니다.');
    if (error instanceof SourcePipelineError) {
      const status = error.code === 'SOURCE_FETCH_TIMEOUT' || error.code === 'SOURCE_UNAVAILABLE' ? 503 : error.code === 'SOURCE_TOO_LARGE' ? 413 : 400;
      const message = error.code === 'SOURCE_UNSUPPORTED' ? '이 소스 유형은 아직 지원하지 않습니다.' : error.code === 'SOURCE_TOO_LARGE' ? '소스 콘텐츠가 너무 큽니다.' : error.code === 'SOURCE_FETCH_TIMEOUT' ? '소스 가져오기 시간이 초과되었습니다.' : error.code === 'SOURCE_UNAVAILABLE' ? '소스 콘텐츠를 가져올 수 없습니다.' : '안전하게 분석할 수 없는 소스입니다.';
      return fail(reply, request, error.code, message, error.retryable, status);
    }
    if (error instanceof PlaceProviderError) {
      const status = error.code === 'rate_limit' ? 429 : error.code === 'bad_request' ? 400 : error.code === 'not_found' ? 404 : 503;
      const code = error.code === 'rate_limit' ? 'PLACE_PROVIDER_RATE_LIMIT' : error.code === 'not_found' ? 'PLACE_NOT_FOUND' : 'PLACE_PROVIDER_UNAVAILABLE';
      return fail(reply, request, code, error.code === 'rate_limit' ? '장소 검색 요청이 많아 잠시 후 다시 시도해 주세요.' : error.code === 'not_found' ? '장소를 찾을 수 없습니다.' : '현재 장소 검색을 사용할 수 없습니다.', error.retryable, status);
    }
    if (error instanceof AiProviderError) {
      return fail(reply, request, 'AI_PROVIDER_UNAVAILABLE', '현재 AI 일정 생성이 지연되고 있습니다.', error.retryable, error.status === 429 ? 429 : 503);
    }
    const code = typeof (error as NodeJS.ErrnoException).code === 'string' ? (error as NodeJS.ErrnoException).code : 'unknown';
    request.log.error({ errorName: error instanceof Error ? error.name : 'UnknownError', code }, 'request failed');
    return fail(reply, request, 'INTERNAL_ERROR', '요청을 처리하지 못했습니다.');
  });

  app.get('/', async (_request, reply) => reply.redirect('/api/v1/health'));
  app.get('/api/v1/health', async () => ({ status: 'ok' }));
  app.get('/api/v1/ready', async (request, reply) => {
    try {
      await deps.readiness?.();
      return { status: 'ready' };
    } catch {
      return fail(reply, request, 'SERVICE_NOT_READY', '서비스가 아직 준비되지 않았습니다.', true, 503);
    }
  });

  app.addHook('preHandler', async (request, reply) => {
    if (request.routeOptions.url === '/api/v1/health' || request.routeOptions.url === '/api/v1/ready' || request.routeOptions.url === '/') return;
    (request as any).auth = await deps.auth.authenticate(request, reply);
  });
  const user = (request: any) => request.auth.userId as string;

  app.post('/api/v1/trips', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) =>
    reply.code(201).send(await deps.repository.create(user(request), CreateTripRequestSchema.parse(request.body))));
  app.get('/api/v1/trips', async (request) => deps.repository.list(user(request)));
  app.get('/api/v1/trips/:tripId', async (request, reply) => {
    const id = idSchema.parse((request.params as any).tripId);
    return await deps.repository.get(user(request), id) ?? fail(reply, request, 'NOT_FOUND', '여행 일정을 찾을 수 없습니다.');
  });
  app.patch('/api/v1/trips/:tripId', async (request, reply) => {
    const id = idSchema.parse((request.params as any).tripId);
    const { version, ...payload } = UpdateTripRequestSchema.parse(request.body);
    const result = await deps.repository.update(user(request), id, payload, version);
    if (result === 'conflict') return fail(reply, request, 'VERSION_CONFLICT', '다른 변경사항이 먼저 저장되었습니다. 새로고침 후 다시 시도해 주세요.');
    return result ?? fail(reply, request, 'NOT_FOUND', '여행 일정을 찾을 수 없습니다.');
  });
  app.delete('/api/v1/trips/:tripId', async (request, reply) =>
    await deps.repository.delete(user(request), idSchema.parse((request.params as any).tripId))
      ? reply.code(204).send()
      : fail(reply, request, 'NOT_FOUND', '여행 일정을 찾을 수 없습니다.'));

  app.post('/api/v1/ai/generate-trip', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    const input = GenerateTripRequestSchema.parse(request.body);
    const intent = await deps.ai.extractIntent(input);
    const candidates = await retrieveIntentCandidates(deps.places, intent);
    const plan = await deps.ai.planTrip(buildTripPlanningInput(input.prompt, intent, candidates));
    return groundPlanWithCandidates(plan, candidates);
  });
  app.post('/api/v1/ai/analyze-source', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    const { input } = AnalyzeSourceRequestSchema.parse(request.body);
    const source = await (deps.sources ?? new TravelSourcePipeline()).process(input);
    return deps.ai.analyzeText({ content: source.content });
  });
  app.post('/api/v1/ai/analyze-text', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) =>
    deps.ai.analyzeText(AnalyzeTextRequestSchema.parse(request.body)));
  app.post('/api/v1/ai/recommendations', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
    const input = RecommendationRequestSchema.parse(request.body);
    const candidates = await retrievePlaceCandidates(deps.places, input);
    if (candidates.length === 0) return [];
    const ranking = await deps.ai.rankPlaces(buildPlaceRankingInput(input, candidates));
    return selectedPlacesToBlocks(candidates, ranking);
  });
  app.get('/api/v1/places/search', async (request) => deps.places.search(PlaceSearchInputSchema.parse(request.query)));
  app.get('/api/v1/places/:placeId', async (request, reply) =>
    await deps.places.getPlace(z.string().min(1).max(200).parse((request.params as any).placeId))
      ?? fail(reply, request, 'NOT_FOUND', '장소를 찾을 수 없습니다.'));
  return app;
}
