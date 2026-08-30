import type { AiRunEvent, AiRunObserver } from '@travel-blocks/ai';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { aiGenerationRuns } from './db/schema.js';

export interface AiGenerationRunRecord {
  tripId: string | null;
  provider: string;
  model: string;
  task: string;
  status: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  errorCode: string | null;
}

export function toAiGenerationRun(event: AiRunEvent, tripId: string | null = null): AiGenerationRunRecord {
  return {
    tripId,
    provider: event.provider,
    model: event.model,
    task: event.task,
    status: event.status,
    latencyMs: event.latencyMs,
    inputTokens: event.inputTokens ?? null,
    outputTokens: event.outputTokens ?? null,
    errorCode: event.errorCode ?? null,
  };
}

export class PostgresAiRunRepository implements AiRunObserver {
  private readonly db: NodePgDatabase;

  constructor(pool: pg.Pool) { this.db = drizzle(pool); }

  async record(event: AiRunEvent): Promise<void> {
    await this.db.insert(aiGenerationRuns).values(toAiGenerationRun(event));
  }
}
