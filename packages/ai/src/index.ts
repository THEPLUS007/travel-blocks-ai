import {
  AnalyzeTextRequestSchema,
  GenerateTripRequestSchema,
  GenerateTripResponseSchema,
  PlaceRankingInputSchema,
  PlaceRankingResultSchema,
  TravelIntentSchema,
  TripPlanningInputSchema,
  type AnalyzeTextInput,
  type GenerateTripInput,
  type PlaceRankingInput,
  type PlaceRankingResult,
  type TravelIntent,
  type TripPlanningInput,
  type TravelPlanDraft,
} from '@travel-blocks/shared';
import { ZodError, type ZodType } from 'zod';
import { toGeminiResponseJsonSchema } from './gemini/structuredOutput.js';
import { buildAnalyzeTravelContentPrompt } from './prompts/analyzeTravelContent.js';
import type { TaskPrompt } from './prompts/common.js';
import { buildExtractIntentPrompt } from './prompts/extractIntent.js';
import { buildGenerateTripPrompt } from './prompts/generateTrip.js';
import { buildRankPlacesPrompt } from './prompts/rankPlaces.js';

export interface TravelAiProvider {
  extractIntent(input: GenerateTripInput): Promise<TravelIntent>;
  planTrip(input: TripPlanningInput): Promise<TravelPlanDraft>;
  generateTrip(input: GenerateTripInput): Promise<TravelPlanDraft>;
  analyzeText(input: AnalyzeTextInput): Promise<TravelPlanDraft>;
  rankPlaces(input: PlaceRankingInput): Promise<PlaceRankingResult>;
}

export type AiTask = 'extract_intent' | 'generate_trip' | 'analyze_text' | 'rank_places';
export type AiRunStatus = 'success' | 'error';
export type InvalidOutputStage = 'missing_text' | 'json_parse' | 'schema_validation';
export interface AiOutputDiagnostics {
  invalidOutputStage?: InvalidOutputStage;
  candidateCount?: number;
  finishReason?: string;
  hasText?: boolean;
  schemaIssueCount?: number;
  schemaIssueCodes?: string[];
  schemaIssuePaths?: string[];
}
export interface AiRunEvent {
  provider: 'gemini';
  model: string;
  task: AiTask;
  status: AiRunStatus;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  providerAttempts: number;
  retryAfterUsed: boolean;
  errorCode?: AiErrorCode;
  invalidOutputStage?: InvalidOutputStage;
  candidateCount?: number;
  finishReason?: string;
  hasText?: boolean;
  schemaIssueCount?: number;
  schemaIssueCodes?: string[];
  schemaIssuePaths?: string[];
}
export interface AiRunObserver { record(event: AiRunEvent): void | Promise<void> }

export type AiErrorCode = 'rate_limit' | 'unavailable' | 'timeout' | 'auth' | 'invalid_output' | 'bad_request' | 'network';
export class AiProviderError extends Error {
  constructor(public code: AiErrorCode, public retryable: boolean, public status?: number, cause?: unknown, public retryAfterMs?: number, public diagnostics?: AiOutputDiagnostics) {
    super(code, { cause });
    this.name = 'AiProviderError';
  }
}

interface AiUsage { inputTokens?: number; outputTokens?: number }
export interface GeminiProviderOptions {
  apiKey: string;
  model?: string;
  intentModel?: string;
  timeoutMs?: number;
  intentTimeoutMs?: number;
  longTaskTimeoutMs?: number;
  longTaskRetryBudgetMs?: number;
  maxRetries?: number;
  maxConcurrency?: number;
  fetch?: typeof fetch;
  onUsage?: (usage: AiUsage) => void;
  observer?: AiRunObserver;
  onObserverError?: (error: unknown) => void;
  wait?: (ms: number) => Promise<void>;
  random?: () => number;
}
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const SHORT_TASK_RETRY_BUDGET_MS = 27_000;
const DEFAULT_INTENT_TIMEOUT_MS = 30_000;
const INTENT_RETRY_BUDGET_HEADROOM_MS = 1_500;
const DEFAULT_LONG_TASK_TIMEOUT_MS = 40_000;
const DEFAULT_LONG_TASK_RETRY_BUDGET_MS = 45_000;

function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function classify(status: number, retryAfter: string | null): AiProviderError {
  if (status === 429) return new AiProviderError('rate_limit', true, status, undefined, retryAfterMs(retryAfter));
  if ([500, 502, 503, 504].includes(status)) return new AiProviderError('unavailable', true, status);
  if ([401, 403].includes(status)) return new AiProviderError('auth', false, status);
  return new AiProviderError('bad_request', false, status);
}

export class GeminiTravelAiProvider implements TravelAiProvider {
  private readonly model: string;
  private readonly intentModel: string;
  private readonly timeoutMs: number;
  private readonly intentTimeoutMs: number;
  private readonly longTaskTimeoutMs: number;
  private readonly longTaskRetryBudgetMs: number;
  private readonly maxRetries: number;
  private readonly fetcher: typeof fetch;
  private readonly waiter: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly options: GeminiProviderOptions) {
    if (!options.apiKey) throw new AiProviderError('auth', false);
    this.model = options.model ?? 'gemini-3.5-flash';
    this.intentModel = options.intentModel ?? this.model;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.intentTimeoutMs = options.intentTimeoutMs ?? DEFAULT_INTENT_TIMEOUT_MS;
    this.longTaskTimeoutMs = options.longTaskTimeoutMs ?? DEFAULT_LONG_TASK_TIMEOUT_MS;
    this.longTaskRetryBudgetMs = options.longTaskRetryBudgetMs ?? DEFAULT_LONG_TASK_RETRY_BUDGET_MS;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetcher = options.fetch ?? fetch;
    this.waiter = options.wait ?? wait;
    this.random = options.random ?? Math.random;
  }

  extractIntent(input: GenerateTripInput): Promise<TravelIntent> {
    const parsed = GenerateTripRequestSchema.parse(input);
    return this.request<TravelIntent>('extract_intent', buildExtractIntentPrompt(parsed), TravelIntentSchema, this.intentModel);
  }

  generateTrip(input: GenerateTripInput): Promise<TravelPlanDraft> {
    const parsed = GenerateTripRequestSchema.parse(input);
    return this.planTrip({ prompt: parsed.prompt, intent: { preferences: [], avoidances: [], requestedCategories: [] }, candidates: [] });
  }

  planTrip(input: TripPlanningInput): Promise<TravelPlanDraft> {
    const parsed = TripPlanningInputSchema.parse(input);
    return this.request<TravelPlanDraft>('generate_trip', buildGenerateTripPrompt(parsed), GenerateTripResponseSchema, this.model, 'travel-plan');
  }

  analyzeText(input: AnalyzeTextInput): Promise<TravelPlanDraft> {
    const parsed = AnalyzeTextRequestSchema.parse(input);
    return this.request<TravelPlanDraft>('analyze_text', buildAnalyzeTravelContentPrompt(parsed), GenerateTripResponseSchema, this.model, 'travel-plan');
  }

  async rankPlaces(input: PlaceRankingInput): Promise<PlaceRankingResult> {
    const parsed = PlaceRankingInputSchema.parse(input);
    const allowed = new Set(parsed.candidates.map((candidate) => candidate.candidateId));
    const rankingSchema = PlaceRankingResultSchema.superRefine((value, context) => {
      const selected = new Set<string>();
      value.selections.forEach((selection, index) => {
        if (!allowed.has(selection.candidateId) || selected.has(selection.candidateId)) context.addIssue({ code: 'custom', path: ['selections', index, 'candidateId'], message: 'Candidate ID must be allowed and unique.' });
        selected.add(selection.candidateId);
      });
    });
    return this.request<PlaceRankingResult>('rank_places', buildRankPlacesPrompt(parsed), rankingSchema, this.model);
  }

  private async slot<T>(operation: () => Promise<T>): Promise<T> {
    const max = this.options.maxConcurrency ?? 1;
    if (this.active >= max) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try { return await operation(); } finally { this.active--; this.queue.shift()?.(); }
  }

  private request<T>(task: AiTask, prompt: TaskPrompt, schema: ZodType<T, any, any>, model: string, compatibility?: 'travel-plan'): Promise<T> {
    const key = `${model}:${task}:${prompt.userData}`;
    const current = this.inFlight.get(key);
    if (current) return current as Promise<T>;
    const startedAt = Date.now();
    let usage: AiUsage = {};
    let diagnostics: AiOutputDiagnostics = {};
    let attempts = 0;
    let retryAfterUsed = false;
    const timeoutMs = this.timeoutFor(task);
    const deadline = Date.now() + this.retryBudgetFor(task);
    const operation = this.slot(async () => {
      let last: unknown;
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        const remaining = deadline - Date.now();
        if (remaining < timeoutMs) throw last ?? new AiProviderError('timeout', true);
        attempts++;
        try { return await this.call(prompt, schema, model, (value) => { usage = value; }, (value) => { diagnostics = value; }, compatibility, timeoutMs); } catch (error) {
          last = error;
          if (!(error instanceof AiProviderError) || !error.retryable || attempt === this.maxRetries || (error.code === 'timeout' && this.isClientTimeoutTerminal(task))) throw error;
          retryAfterUsed ||= error.retryAfterMs !== undefined;
          const delay = error.retryAfterMs ?? this.backoffMs(attempt);
          if (delay + timeoutMs > deadline - Date.now()) throw error;
          await this.waiter(delay);
        }
      }
      throw last;
    });
    const promise = operation.then(
      async (result) => { await this.observe({ provider: 'gemini', model, task, status: 'success', latencyMs: Date.now() - startedAt, ...usage, ...diagnostics, providerAttempts: attempts, retryAfterUsed }); return result; },
      async (error) => { await this.observe({ provider: 'gemini', model, task, status: 'error', latencyMs: Date.now() - startedAt, ...usage, ...diagnostics, ...(error instanceof AiProviderError ? error.diagnostics : {}), providerAttempts: attempts, retryAfterUsed, errorCode: error instanceof AiProviderError ? error.code : 'network' }); throw error; },
    ).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  private async observe(event: AiRunEvent): Promise<void> {
    try { await this.options.observer?.record(event); } catch (error) { this.options.onObserverError?.(error); }
  }

  private backoffMs(attempt: number): number {
    const base = Math.min(1_000 * 2 ** attempt, 4_000);
    return Math.round(base * (0.8 + this.random() * 0.4));
  }

  private isLongTask(task: AiTask): boolean { return task === 'generate_trip' || task === 'analyze_text'; }
  private isClientTimeoutTerminal(task: AiTask): boolean { return task === 'extract_intent' || this.isLongTask(task); }
  private timeoutFor(task: AiTask): number { return task === 'extract_intent' ? this.intentTimeoutMs : this.isLongTask(task) ? this.longTaskTimeoutMs : this.timeoutMs; }
  private retryBudgetFor(task: AiTask): number { return task === 'extract_intent' ? Math.max(SHORT_TASK_RETRY_BUDGET_MS, this.intentTimeoutMs + INTENT_RETRY_BUDGET_HEADROOM_MS) : this.isLongTask(task) ? this.longTaskRetryBudgetMs : SHORT_TASK_RETRY_BUDGET_MS; }

  private async call<T>(prompt: TaskPrompt, schema: ZodType<T, any, any>, model: string, captureUsage: (usage: AiUsage) => void, captureDiagnostics: (diagnostics: AiOutputDiagnostics) => void, compatibility?: 'travel-plan', timeoutMs = this.timeoutMs): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.options.apiKey },
        signal: controller.signal,
        body: JSON.stringify({ systemInstruction: { parts: [{ text: prompt.systemInstruction }] }, contents: [{ role: 'user', parts: [{ text: prompt.userData }] }], generationConfig: { responseMimeType: 'application/json', responseJsonSchema: toGeminiResponseJsonSchema(schema, compatibility) } }),
      });
      if (!response.ok) throw classify(response.status, response.headers.get('retry-after'));
      const body = await response.json() as { candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
      const usage = { inputTokens: body.usageMetadata?.promptTokenCount, outputTokens: body.usageMetadata?.candidatesTokenCount };
      captureUsage(usage);
      this.options.onUsage?.(usage);
      const candidate = body.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      const diagnostics: AiOutputDiagnostics = { candidateCount: body.candidates?.length ?? 0, finishReason: typeof candidate?.finishReason === 'string' ? candidate.finishReason : undefined, hasText: Boolean(text) };
      captureDiagnostics(diagnostics);
      if (!text) throw new AiProviderError('invalid_output', false, undefined, undefined, undefined, { ...diagnostics, invalidOutputStage: 'missing_text' });
      let output: unknown;
      try { output = JSON.parse(text); } catch (error) { throw new AiProviderError('invalid_output', false, undefined, error, undefined, { ...diagnostics, invalidOutputStage: 'json_parse' }); }
      try { return schema.parse(output); } catch (error) {
        const schemaDiagnostics: AiOutputDiagnostics = error instanceof ZodError ? { ...diagnostics, invalidOutputStage: 'schema_validation', schemaIssueCount: error.issues.length, schemaIssueCodes: [...new Set(error.issues.map((issue) => issue.code))].slice(0, 10), schemaIssuePaths: error.issues.slice(0, 10).map((issue) => issue.path.map((part) => typeof part === 'number' ? String(part) : String(part).replace(/[^a-zA-Z0-9_.-]/g, '_')).join('.').slice(0, 160)) } : { ...diagnostics, invalidOutputStage: 'schema_validation' };
        throw new AiProviderError('invalid_output', false, undefined, error, undefined, schemaDiagnostics);
      }
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new AiProviderError('timeout', true, undefined, error);
      throw new AiProviderError('network', true, undefined, error);
    } finally { clearTimeout(timer); }
  }
}
