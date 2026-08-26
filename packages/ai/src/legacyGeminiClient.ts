declare const process: {
  env: Record<string, string | undefined>;
};

export type GeminiTask = 'analyze-input' | 'generate-trip' | 'recommendations';

export type GeminiErrorCategory =
  | 'rate_limit'
  | 'unavailable'
  | 'timeout'
  | 'auth'
  | 'bad_request'
  | 'safety_or_policy'
  | 'parse'
  | 'network'
  | 'unknown';

export interface GeminiClientErrorOptions {
  status?: number;
  category: GeminiErrorCategory;
  retryable: boolean;
  attempts: number;
  cause?: unknown;
}

export class GeminiClientError extends Error {
  status?: number;
  category: GeminiErrorCategory;
  retryable: boolean;
  attempts: number;
  cause?: unknown;

  constructor(message: string, options: GeminiClientErrorOptions) {
    super(message);
    this.name = 'GeminiClientError';
    this.status = options.status;
    this.category = options.category;
    this.retryable = options.retryable;
    this.attempts = options.attempts;
    this.cause = options.cause;
  }
}

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_CONCURRENCY = 1;
const MAX_QUEUE_SIZE = 8;
const MAX_RETRY_DELAY_MS = 5000;
const REQUEST_ID_PREFIX = 'gemini';

type QueueTask<T> = {
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

let activeRequests = 0;
const queue: QueueTask<unknown>[] = [];
const inFlightRequests = new Map<string, Promise<unknown>>();

function getEnvNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getGeminiConfig() {
  return {
    model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    timeoutMs: getEnvNumber('GEMINI_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
    maxRetries: getEnvNumber('GEMINI_MAX_RETRIES', DEFAULT_MAX_RETRIES),
    maxConcurrency: getEnvNumber('GEMINI_MAX_CONCURRENCY', DEFAULT_MAX_CONCURRENCY),
  };
}

function createRequestId(): string {
  return `${REQUEST_ID_PREFIX}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function logGemini(event: string, details: Record<string, string | number | boolean | undefined>) {
  const pairs = Object.entries(details)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  console.info(`[Gemini] ${event} ${pairs} timestamp=${nowIso()}`);
}

function classifyStatus(status: number): { category: GeminiErrorCategory; retryable: boolean } {
  if (status === 408) return { category: 'timeout', retryable: true };
  if (status === 429) return { category: 'rate_limit', retryable: true };
  if ([500, 502, 503, 504].includes(status)) return { category: 'unavailable', retryable: true };
  if (status === 401 || status === 403) return { category: 'auth', retryable: false };
  if (status === 400) return { category: 'bad_request', retryable: false };
  return { category: 'unknown', retryable: false };
}

function classifyNetworkError(error: unknown): GeminiErrorCategory {
  if (error instanceof Error && error.message === 'TIMEOUT') {
    return 'timeout';
  }

  return 'network';
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
  }

  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.min(Math.max(dateMs - Date.now(), 0), MAX_RETRY_DELAY_MS);
  }

  return undefined;
}

function retryDelayMs(attemptIndex: number, retryAfter?: string | null): number {
  const retryAfterMs = parseRetryAfterMs(retryAfter ?? null);
  if (retryAfterMs !== undefined) {
    return retryAfterMs;
  }

  return Math.min(1000 * 2 ** attemptIndex, MAX_RETRY_DELAY_MS) + Math.floor(Math.random() * 500);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
    task.then(resolve).catch(reject).finally(() => clearTimeout(timeoutId));
  });
}

function runNextQueueItem() {
  const { maxConcurrency } = getGeminiConfig();

  if (activeRequests >= maxConcurrency) {
    return;
  }

  const next = queue.shift();
  if (!next) {
    return;
  }

  activeRequests += 1;
  next.run()
    .then(next.resolve)
    .catch(next.reject)
    .finally(() => {
      activeRequests -= 1;
      runNextQueueItem();
    });
}

function enqueue<T>(run: () => Promise<T>): Promise<T> {
  const { maxConcurrency } = getGeminiConfig();

  if (activeRequests < maxConcurrency) {
    activeRequests += 1;
    return run().finally(() => {
      activeRequests -= 1;
      runNextQueueItem();
    });
  }

  if (queue.length >= MAX_QUEUE_SIZE) {
    return Promise.reject(
      new GeminiClientError('Gemini queue is full', {
        category: 'rate_limit',
        retryable: true,
        attempts: 0,
      }),
    );
  }

  return new Promise<T>((resolve, reject) => {
    queue.push({ run, resolve: resolve as (value: unknown) => void, reject });
  });
}

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizePrompt(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim();
}

function createDedupeKey(task: GeminiTask, prompt: string): string {
  return `${task}:${stableHash(normalizePrompt(prompt))}`;
}

async function fetchGeminiOnce(prompt: string, requestId: string, task: GeminiTask, attempt: number): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new GeminiClientError('Gemini key unavailable', {
      category: 'auth',
      retryable: false,
      attempts: attempt,
    });
  }

  const { model, timeoutMs } = getGeminiConfig();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const startedAt = Date.now();

  logGemini('request-start', { id: requestId, task, attempt });

  let response: Response;
  try {
    response = await withTimeout(
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
            maxOutputTokens: 4096,
          },
        }),
      }),
      timeoutMs,
    );
  } catch (error) {
    const category = classifyNetworkError(error);
    throw new GeminiClientError('Gemini network failure', {
      category,
      retryable: true,
      attempts: attempt,
      cause: error,
    });
  }

  if (!response.ok) {
    const classified = classifyStatus(response.status);
    throw new GeminiClientError('Gemini HTTP failure', {
      status: response.status,
      category: classified.category,
      retryable: classified.retryable,
      attempts: attempt,
      cause: response.headers.get('Retry-After'),
    });
  }

  const geminiJson = await response.json() as Record<string, unknown>;
  const candidates = Array.isArray(geminiJson.candidates) ? geminiJson.candidates : [];
  const firstCandidate = candidates[0] as Record<string, unknown> | undefined;
  const contentRecord = firstCandidate?.content as Record<string, unknown> | undefined;
  const parts = Array.isArray(contentRecord?.parts) ? contentRecord.parts : [];
  const generatedText = parts
    .map((part) => (part && typeof part === 'object' ? (part as Record<string, unknown>).text : undefined))
    .filter((part): part is string => typeof part === 'string')
    .join('\n')
    .trim();

  if (!generatedText) {
    throw new GeminiClientError('Gemini empty response', {
      category: 'parse',
      retryable: false,
      attempts: attempt,
    });
  }

  logGemini('request-success', { id: requestId, task, attempt, durationMs: Date.now() - startedAt });
  return generatedText;
}

async function executeGeminiText(prompt: string, task: GeminiTask): Promise<string> {
  const requestId = createRequestId();
  const { maxRetries } = getGeminiConfig();
  const maxAttempts = maxRetries + 1;
  let lastError: GeminiClientError | undefined;

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    const attempt = attemptIndex + 1;

    try {
      return await fetchGeminiOnce(prompt, requestId, task, attempt);
    } catch (error) {
      const geminiError = error instanceof GeminiClientError
        ? error
        : new GeminiClientError('Gemini unknown failure', {
            category: 'unknown',
            retryable: false,
            attempts: attempt,
            cause: error,
          });
      lastError = geminiError;

      if (!geminiError.retryable || attempt >= maxAttempts) {
        logGemini('fallback', {
          id: requestId,
          task,
          status: geminiError.status,
          reason: geminiError.category,
          attempts: attempt,
          fallback: true,
        });
        throw geminiError;
      }

      const delayMs = retryDelayMs(attemptIndex, typeof geminiError.cause === 'string' ? geminiError.cause : null);
      logGemini('retry', {
        id: requestId,
        task,
        status: geminiError.status,
        reason: geminiError.category,
        attempt: attempt + 1,
        delayMs,
      });
      await delay(delayMs);
    }
  }

  throw lastError ?? new GeminiClientError('Gemini failed', { category: 'unknown', retryable: false, attempts: maxAttempts });
}

export async function callGeminiJson(prompt: string, task: GeminiTask): Promise<unknown> {
  const normalizedPrompt = normalizePrompt(prompt);
  const dedupeKey = createDedupeKey(task, normalizedPrompt);
  const existing = inFlightRequests.get(dedupeKey);

  if (existing) {
    return existing;
  }

  const promise = enqueue(async () => {
    const generatedText = await executeGeminiText(normalizedPrompt, task);
    try {
      return JSON.parse(extractJsonText(generatedText)) as unknown;
    } catch (error) {
      throw new GeminiClientError('Gemini JSON parse failure', {
        category: 'parse',
        retryable: false,
        attempts: 1,
        cause: error,
      });
    }
  });

  inFlightRequests.set(dedupeKey, promise);
  promise.finally(() => inFlightRequests.delete(dedupeKey)).catch(() => undefined);
  return promise;
}

function extractJsonText(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstArray = trimmed.indexOf('[');
  const lastArray = trimmed.lastIndexOf(']');

  if (firstArray >= 0 && lastArray > firstArray) {
    return trimmed.slice(firstArray, lastArray + 1);
  }

  const firstObject = trimmed.indexOf('{');
  const lastObject = trimmed.lastIndexOf('}');

  if (firstObject >= 0 && lastObject > firstObject) {
    return trimmed.slice(firstObject, lastObject + 1);
  }

  return trimmed;
}
