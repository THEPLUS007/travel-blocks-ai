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
import type { ZodType } from 'zod';
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
export interface AiRunEvent {
  provider: 'gemini';
  model: string;
  task: AiTask;
  status: AiRunStatus;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  errorCode?: AiErrorCode;
}
export interface AiRunObserver { record(event: AiRunEvent): void | Promise<void> }

export type AiErrorCode = 'rate_limit' | 'unavailable' | 'timeout' | 'auth' | 'invalid_output' | 'bad_request' | 'network';
export class AiProviderError extends Error {
  constructor(public code: AiErrorCode, public retryable: boolean, public status?: number, cause?: unknown, public retryAfterMs?: number) {
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
const RETRY_BUDGET_MS = 27_000;

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
    const max = this.options.maxConcurrency ?? 2;
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
    const deadline = Date.now() + RETRY_BUDGET_MS;
    const operation = this.slot(async () => {
      let last: unknown;
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw last ?? new AiProviderError('timeout', true);
        try { return await this.call(prompt, schema, model, (value) => { usage = value; }, compatibility, Math.min(this.timeoutMs, remaining)); } catch (error) {
          last = error;
          if (!(error instanceof AiProviderError) || !error.retryable || attempt === this.maxRetries) throw error;
          const delay = error.retryAfterMs ?? this.backoffMs(attempt);
          if (delay >= deadline - Date.now()) throw error;
          await this.waiter(delay);
        }
      }
      throw last;
    });
    const promise = operation.then(
      async (result) => { await this.observe({ provider: 'gemini', model, task, status: 'success', latencyMs: Date.now() - startedAt, ...usage }); return result; },
      async (error) => { await this.observe({ provider: 'gemini', model, task, status: 'error', latencyMs: Date.now() - startedAt, ...usage, errorCode: error instanceof AiProviderError ? error.code : 'network' }); throw error; },
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

  private async call<T>(prompt: TaskPrompt, schema: ZodType<T, any, any>, model: string, captureUsage: (usage: AiUsage) => void, compatibility?: 'travel-plan', timeoutMs = this.timeoutMs): Promise<T> {
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
      const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
      const usage = { inputTokens: body.usageMetadata?.promptTokenCount, outputTokens: body.usageMetadata?.candidatesTokenCount };
      captureUsage(usage);
      this.options.onUsage?.(usage);
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new AiProviderError('invalid_output', false);
      try { return schema.parse(JSON.parse(text)); } catch (error) { throw new AiProviderError('invalid_output', false, undefined, error); }
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new AiProviderError('timeout', true, undefined, error);
      throw new AiProviderError('network', true, undefined, error);
    } finally { clearTimeout(timer); }
  }
}
