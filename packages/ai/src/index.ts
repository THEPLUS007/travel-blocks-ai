import {
  AnalyzeTextRequestSchema,
  GenerateTripRequestSchema,
  GenerateTripResponseSchema,
  PlaceRankingInputSchema,
  PlaceRankingResultSchema,
  TravelIntentSchema,
  type AnalyzeTextInput,
  type GenerateTripInput,
  type PlaceRankingInput,
  type PlaceRankingResult,
  type TravelIntent,
  type TravelPlanDraft,
} from '@travel-blocks/shared';
import { buildAnalyzeTravelContentPrompt } from './prompts/analyzeTravelContent.js';
import { buildGenerateTripPrompt } from './prompts/generateTrip.js';
import { buildExtractIntentPrompt } from './prompts/extractIntent.js';
import { buildRankPlacesPrompt } from './prompts/rankPlaces.js';
import type { TaskPrompt } from './prompts/common.js';
import type { ZodType } from 'zod';
import { toGeminiResponseJsonSchema } from './gemini/structuredOutput.js';

export interface TravelAiProvider {
  extractIntent(input: GenerateTripInput): Promise<TravelIntent>;
  generateTrip(input: GenerateTripInput): Promise<TravelPlanDraft>;
  analyzeText(input: AnalyzeTextInput): Promise<TravelPlanDraft>;
  rankPlaces(input: PlaceRankingInput): Promise<PlaceRankingResult>;
}

export type AiErrorCode = 'rate_limit' | 'unavailable' | 'timeout' | 'auth' | 'invalid_output' | 'bad_request' | 'network';
export class AiProviderError extends Error {
  constructor(public code: AiErrorCode, public retryable: boolean, public status?: number, cause?: unknown) {
    super(code, { cause });
    this.name = 'AiProviderError';
  }
}

export interface GeminiProviderOptions {
  apiKey: string;
  model?: string;
  intentModel?: string;
  timeoutMs?: number;
  maxRetries?: number;
  maxConcurrency?: number;
  fetch?: typeof fetch;
  onUsage?: (usage: { inputTokens?: number; outputTokens?: number }) => void;
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const classify = (status: number) => status === 429 ? new AiProviderError('rate_limit', true, status) : [500, 502, 503, 504].includes(status) ? new AiProviderError('unavailable', true, status) : [401, 403].includes(status) ? new AiProviderError('auth', false, status) : new AiProviderError('bad_request', false, status);

export class GeminiTravelAiProvider implements TravelAiProvider {
  private readonly model: string;
  private readonly intentModel: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetcher: typeof fetch;
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
  }

  extractIntent(input: GenerateTripInput): Promise<TravelIntent> {
    const parsed = GenerateTripRequestSchema.parse(input);
    return this.request<TravelIntent>('extract_intent', buildExtractIntentPrompt(parsed), TravelIntentSchema, this.intentModel);
  }

  generateTrip(input: GenerateTripInput): Promise<TravelPlanDraft> {
    const parsed = GenerateTripRequestSchema.parse(input);
    return this.request<TravelPlanDraft>('generate_trip', buildGenerateTripPrompt(parsed), GenerateTripResponseSchema, this.model);
  }

  analyzeText(input: AnalyzeTextInput): Promise<TravelPlanDraft> {
    const parsed = AnalyzeTextRequestSchema.parse(input);
    return this.request<TravelPlanDraft>('analyze_travel_content', buildAnalyzeTravelContentPrompt(parsed), GenerateTripResponseSchema, this.model);
  }

  async rankPlaces(input: PlaceRankingInput): Promise<PlaceRankingResult> {
    const parsed = PlaceRankingInputSchema.parse(input);
    const result = await this.request<PlaceRankingResult>('rank_places', buildRankPlacesPrompt(parsed), PlaceRankingResultSchema, this.model);
    const allowed = new Set(parsed.candidates.map((candidate) => candidate.candidateId));
    const selected = new Set<string>();
    for (const selection of result.selections) {
      if (!allowed.has(selection.candidateId) || selected.has(selection.candidateId)) throw new AiProviderError('invalid_output', false);
      selected.add(selection.candidateId);
    }
    return result;
  }

  private async slot<T>(task: () => Promise<T>): Promise<T> {
    const max = this.options.maxConcurrency ?? 2;
    if (this.active >= max) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try { return await task(); } finally { this.active--; this.queue.shift()?.(); }
  }

  private request<T>(task: string, prompt: TaskPrompt, schema: ZodType<T, any, any>, model: string): Promise<T> {
    const key = `${model}:${task}:${prompt.userData}`;
    const current = this.inFlight.get(key);
    if (current) return current as Promise<T>;
    const promise = this.slot(async () => {
      let last: unknown;
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try { return await this.call(prompt, schema, model); } catch (error) {
          last = error;
          if (!(error instanceof AiProviderError) || !error.retryable || attempt === this.maxRetries) throw error;
          await wait(Math.min(250 * 2 ** attempt, 2000));
        }
      }
      throw last;
    }).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  private async call<T>(prompt: TaskPrompt, schema: ZodType<T, any, any>, model: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.options.apiKey },
        signal: controller.signal,
        body: JSON.stringify({ systemInstruction: { parts: [{ text: prompt.systemInstruction }] }, contents: [{ role: 'user', parts: [{ text: prompt.userData }] }], generationConfig: { responseMimeType: 'application/json', responseJsonSchema: toGeminiResponseJsonSchema(schema) } }),
      });
      if (!response.ok) throw classify(response.status);
      const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
      this.options.onUsage?.({ inputTokens: body.usageMetadata?.promptTokenCount, outputTokens: body.usageMetadata?.candidatesTokenCount });
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
