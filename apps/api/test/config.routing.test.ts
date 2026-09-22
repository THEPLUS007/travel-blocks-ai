import { afterEach, describe, expect, it } from 'vitest';
import { loadApiConfig } from '../src/config.js';

const keys = ['DATABASE_URL', 'NODE_ENV', 'GEMINI_MAX_CONCURRENCY', 'SELF_HOSTED_LLM_ENABLED', 'SELF_HOSTED_LLM_ENDPOINT', 'SELF_HOSTED_LLM_MODEL', 'AI_ROUTING_MODE', 'SELF_HOSTED_LLM_READINESS'] as const;
const original = new Map(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function baseEnvironment(): void {
  process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/travel';
  process.env.NODE_ENV = 'test';
  process.env.SELF_HOSTED_LLM_ENABLED = 'false';
  process.env.SELF_HOSTED_LLM_ENDPOINT = '';
  process.env.GEMINI_MAX_CONCURRENCY = '1';
  process.env.SELF_HOSTED_LLM_MODEL = '';
}

describe('AI routing configuration', () => {
  it('keeps Gemini-only routing and unknown self-hosted readiness as the safe defaults', () => {
    baseEnvironment();
    process.env.AI_ROUTING_MODE = '';
    process.env.SELF_HOSTED_LLM_READINESS = '';

    expect(loadApiConfig()).toMatchObject({ aiRoutingMode: 'gemini_only', selfHostedLlmEnabled: false, selfHostedLlmReadiness: 'unknown' });
  });

  it('accepts an explicit hybrid opt-in without treating it as provider enablement', () => {
    baseEnvironment();
    process.env.AI_ROUTING_MODE = 'hybrid';
    process.env.SELF_HOSTED_LLM_READINESS = 'healthy';

    expect(loadApiConfig()).toMatchObject({ aiRoutingMode: 'hybrid', selfHostedLlmEnabled: false, selfHostedLlmReadiness: 'healthy' });
  });

  it.each([
    ['AI_ROUTING_MODE', 'automatic', 'AI_ROUTING_MODE must be gemini_only or hybrid'],
    ['SELF_HOSTED_LLM_READINESS', 'ready', 'SELF_HOSTED_LLM_READINESS must be healthy, unhealthy, or unknown'],
  ])('rejects invalid %s without exposing configuration values', (key, value, message) => {
    baseEnvironment();
    process.env.AI_ROUTING_MODE = 'gemini_only';
    process.env.SELF_HOSTED_LLM_READINESS = 'unknown';
    process.env[key] = value;

    expect(() => loadApiConfig()).toThrow(message);
    expect(() => loadApiConfig()).not.toThrow(value);
  });
});
