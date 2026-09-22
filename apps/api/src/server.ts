import { AiProviderError, AiRoutingPolicy, AiTaskRouter, GeminiTravelAiProvider, SelfHostedHttpTransport, SelfHostedTravelAiProvider, StaticAiProviderHealthSource, createGeminiAiRegistration, createSelfHostedAiRegistration, type TravelAiProvider } from '@travel-blocks/ai';
import type { AnalyzeTextInput, GenerateTripInput, PlaceRankingInput, PlaceRankingResult, TravelIntent, TripPlanningInput, TravelPlanDraft } from '@travel-blocks/shared';
import { PostgresAiRunRepository } from './aiRuns.js';
import { AnonymousSessionAuth } from './auth.js';
import { buildApp } from './app.js';
import { loadApiConfig } from './config.js';
import { GooglePlacesProvider, UnconfiguredPlaceProvider } from './places.js';
import { checkDatabase, createPool, PostgresTripRepository } from './repository.js';
import { TravelSourcePipeline } from './sources.js';

class UnavailableAiProvider implements TravelAiProvider {
  private unavailable(): never { throw new AiProviderError('auth', false); }
  async extractIntent(_input: GenerateTripInput): Promise<TravelIntent> { return this.unavailable(); }
  async generateTrip(_input: GenerateTripInput): Promise<TravelPlanDraft> { return this.unavailable(); }
  async planTrip(_input: TripPlanningInput): Promise<TravelPlanDraft> { return this.unavailable(); }
  async analyzeText(_input: AnalyzeTextInput): Promise<TravelPlanDraft> { return this.unavailable(); }
  async rankPlaces(_input: PlaceRankingInput): Promise<PlaceRankingResult> { return this.unavailable(); }
}

const config = loadApiConfig();
const pool = createPool(config.databaseUrl, {
  max: config.dbMaxConnections,
  connectionTimeoutMillis: config.dbConnectionTimeoutMs,
  idleTimeoutMillis: config.dbIdleTimeoutMs,
  statementTimeoutMillis: config.dbStatementTimeoutMs,
});

let app: Awaited<ReturnType<typeof buildApp>> | undefined;
let shuttingDown = false;

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[Server] shutdown signal=${signal}`);
  const forced = setTimeout(() => process.exit(1), 10_000);
  forced.unref();
  try {
    await app?.close();
    await pool.end();
    clearTimeout(forced);
    process.exit(exitCode);
  } catch {
    process.exit(1);
  }
}

try {
  await checkDatabase(pool);
  const repository = new PostgresTripRepository(pool);
  const aiRuns = new PostgresAiRunRepository(pool);
  const places = config.googlePlacesApiKey
    ? new GooglePlacesProvider({ apiKey: config.googlePlacesApiKey, timeoutMs: config.googlePlacesTimeoutMs })
    : new UnconfiguredPlaceProvider();
  const onAiObserverError = (error: unknown): void => { const code = typeof (error as NodeJS.ErrnoException).code === 'string' ? (error as NodeJS.ErrnoException).code : 'unknown'; console.error('[AI Observability] insert failed code=' + code); };
  const aiRunObserver = { record: async (event: Parameters<PostgresAiRunRepository['record']>[0]) => { console.info(`[AI] run ${JSON.stringify(event)}`); await aiRuns.record(event); } };
  const ai: TravelAiProvider = config.geminiApiKey
    ? (() => {
        const registrations = [createGeminiAiRegistration(new GeminiTravelAiProvider({
          apiKey: config.geminiApiKey,
          model: config.geminiModel,
          intentModel: config.geminiIntentModel,
          timeoutMs: config.geminiTimeoutMs,
          intentTimeoutMs: config.geminiIntentTimeoutMs,
          longTaskTimeoutMs: config.geminiLongTaskTimeoutMs,
          longTaskRetryBudgetMs: config.geminiLongTaskRetryBudgetMs,
          maxRetries: config.geminiMaxRetries,
          maxConcurrency: config.geminiMaxConcurrency,
          observer: aiRunObserver,
          onObserverError: onAiObserverError,
        }))];
        if (config.selfHostedLlmEnabled) {
          registrations.push(createSelfHostedAiRegistration(new SelfHostedTravelAiProvider({
            model: config.selfHostedLlmModel!,
            timeoutMs: config.selfHostedLlmTimeoutMs,
            transport: new SelfHostedHttpTransport({ baseUrl: config.selfHostedLlmEndpoint!, apiToken: config.selfHostedLlmApiToken }),
            observer: aiRunObserver,
            onObserverError: onAiObserverError,
          })));
        }
        const policy = new AiRoutingPolicy({
          mode: config.aiRoutingMode,
          registrations,
          selfHostedEnabled: config.selfHostedLlmEnabled,
          health: new StaticAiProviderHealthSource({ self_hosted: config.selfHostedLlmReadiness }),
        });
        return new AiTaskRouter(registrations, {
          policy,
          observer: { record: (decision) => console.info(`[AI Routing] ${JSON.stringify(decision)}`) },
          onObserverError: onAiObserverError,
        });
      })()
    : new UnavailableAiProvider();
  app = await buildApp({
    repository,
    auth: new AnonymousSessionAuth(repository, { secure: config.cookieSecure }),
    ai,
    places,
    sources: new TravelSourcePipeline(),
    readiness: () => checkDatabase(pool),
    logger: true,
    trustProxy: config.trustProxy,
  });
  await app.listen({ host: config.host, port: config.port });
  console.info(`[Server] ready port=${config.port} database=connected ai=${config.geminiApiKey ? 'configured' : 'unavailable'} places=${config.googlePlacesApiKey ? 'google' : 'unavailable'}`);
} catch (error) {
  const code = typeof (error as NodeJS.ErrnoException).code === 'string' ? (error as NodeJS.ErrnoException).code : 'unknown';
  console.error(`[Server] startup failed code=${code}`);
  await pool.end().catch(() => undefined);
  process.exit(1);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', () => void shutdown('unhandledRejection', 1));
process.on('uncaughtException', () => void shutdown('uncaughtException', 1));
