import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadRootEnv(): void {
  const path = resolve(process.cwd(), process.cwd().endsWith('/apps/api') ? '../../.env' : '.env');
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    return;
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function boolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

export interface ApiConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl: string;
  cookieSecure: boolean;
  trustProxy: boolean;
  webOrigin?: string;
  geminiApiKey?: string;
  geminiModel: string;
  geminiTimeoutMs: number;
  geminiMaxRetries: number;
  geminiMaxConcurrency: number;
  dbMaxConnections: number;
  dbConnectionTimeoutMs: number;
  dbIdleTimeoutMs: number;
  dbStatementTimeoutMs: number;
}

export function loadApiConfig(): ApiConfig {
  loadRootEnv();
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  try {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }

  return {
    nodeEnv: nodeEnv as ApiConfig['nodeEnv'],
    host: process.env.API_HOST || '0.0.0.0',
    port: integer('PORT', integer('API_PORT', 3000, 1, 65535), 1, 65535),
    databaseUrl,
    cookieSecure: boolean('COOKIE_SECURE', false),
    trustProxy: boolean('TRUST_PROXY', false),
    webOrigin: process.env.WEB_ORIGIN || undefined,
    geminiApiKey: process.env.GEMINI_API_KEY || undefined,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    geminiTimeoutMs: integer('GEMINI_TIMEOUT_MS', 15_000, 1000, 120_000),
    geminiMaxRetries: integer('GEMINI_MAX_RETRIES', 2, 0, 5),
    geminiMaxConcurrency: integer('GEMINI_MAX_CONCURRENCY', 2, 1, 20),
    dbMaxConnections: integer('DB_MAX_CONNECTIONS', 10, 1, 50),
    dbConnectionTimeoutMs: integer('DB_CONNECTION_TIMEOUT_MS', 5000, 100, 60_000),
    dbIdleTimeoutMs: integer('DB_IDLE_TIMEOUT_MS', 30_000, 1000, 600_000),
    dbStatementTimeoutMs: integer('DB_STATEMENT_TIMEOUT_MS', 10_000, 100, 120_000),
  };
}

export function loadDatabaseUrlForTooling(): string {
  loadRootEnv();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  return process.env.DATABASE_URL;
}
