import { expect, it } from 'vitest';
import type { AiRunEvent } from '@travel-blocks/ai';
import { toAiGenerationRun } from '../src/aiRuns.js';

it('maps an AI lifecycle event without prompt, response, key, or fake trip ID', () => {
  const event: AiRunEvent = { provider: 'gemini', model: 'planning', task: 'extract_intent', status: 'success', latencyMs: 42, inputTokens: 5, outputTokens: 3 };
  const record = toAiGenerationRun(event);
  expect(record).toEqual({ tripId: null, provider: 'gemini', model: 'planning', task: 'extract_intent', status: 'success', latencyMs: 42, inputTokens: 5, outputTokens: 3, errorCode: null });
  expect(Object.keys(record)).not.toEqual(expect.arrayContaining(['prompt', 'rawResponse', 'apiKey']));
});

it('maps a known failure code', () => {
  const event: AiRunEvent = { provider: 'gemini', model: 'planning', task: 'rank_places', status: 'error', latencyMs: 10, errorCode: 'timeout' };
  expect(toAiGenerationRun(event)).toMatchObject({ status: 'error', errorCode: 'timeout', inputTokens: null, outputTokens: null });
});
