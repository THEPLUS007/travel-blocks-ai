import { and, asc, eq, inArray } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import {
  TravelBlockSchema,
  TravelConnectionSchema,
  type SavedTravelPlan,
  type TravelBlock,
  type TravelConnection,
  type TravelPlanPayload,
} from '@travel-blocks/shared';
import { travelBlocks, travelConnections, travelDays, trips, users } from './db/schema.js';

export interface TripRepository {
  findOrCreateUser(sessionHash: string): Promise<string>;
  create(userId: string, payload: TravelPlanPayload): Promise<SavedTravelPlan>;
  list(userId: string): Promise<SavedTravelPlan[]>;
  get(userId: string, id: string): Promise<SavedTravelPlan | null>;
  update(userId: string, id: string, payload: TravelPlanPayload, version: number): Promise<SavedTravelPlan | null | 'conflict'>;
  delete(userId: string, id: string): Promise<boolean>;
}

export interface PoolOptions {
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  statementTimeoutMillis: number;
}

export function createPool(url: string, options?: Partial<PoolOptions>): pg.Pool {
  const pool = new pg.Pool({
    connectionString: url,
    max: options?.max ?? 10,
    connectionTimeoutMillis: options?.connectionTimeoutMillis ?? 5000,
    idleTimeoutMillis: options?.idleTimeoutMillis ?? 30_000,
    statement_timeout: options?.statementTimeoutMillis ?? 10_000,
  });
  pool.on('error', (error) => {
    console.error(`[Database] idle client error code=${typeof (error as NodeJS.ErrnoException).code === 'string' ? (error as NodeJS.ErrnoException).code : 'unknown'}`);
  });
  return pool;
}

export async function checkDatabase(pool: pg.Pool): Promise<void> {
  await pool.query('SELECT 1');
}

export class PostgresTripRepository implements TripRepository {
  private readonly db: NodePgDatabase;

  constructor(private readonly pool: pg.Pool) {
    this.db = drizzle(pool);
  }

  async findOrCreateUser(sessionHash: string): Promise<string> {
    const found = await this.db.select({ id: users.id }).from(users).where(eq(users.sessionHash, sessionHash)).limit(1);
    if (found[0]) return found[0].id;
    const [created] = await this.db.insert(users).values({ sessionHash }).onConflictDoNothing().returning({ id: users.id });
    if (created) return created.id;
    const [concurrent] = await this.db.select({ id: users.id }).from(users).where(eq(users.sessionHash, sessionHash)).limit(1);
    if (!concurrent) throw new Error('SESSION_USER_CREATE_FAILED');
    return concurrent.id;
  }

  async create(userId: string, payload: TravelPlanPayload): Promise<SavedTravelPlan> {
    const id = await this.db.transaction(async (tx) => {
      const [trip] = await tx.insert(trips).values({ userId, ...payload.trip }).returning({ id: trips.id });
      if (!trip) throw new Error('TRIP_CREATE_FAILED');
      await this.replaceChildren(tx, trip.id, payload);
      return trip.id;
    });
    const saved = await this.get(userId, id);
    if (!saved) throw new Error('TRIP_READ_AFTER_CREATE_FAILED');
    return saved;
  }

  async list(userId: string): Promise<SavedTravelPlan[]> {
    const rows = await this.db.select({ id: trips.id }).from(trips).where(eq(trips.userId, userId)).orderBy(asc(trips.createdAt));
    const plans = await Promise.all(rows.map((row) => this.get(userId, row.id)));
    return plans.filter((plan): plan is SavedTravelPlan => plan !== null);
  }

  async get(userId: string, id: string): Promise<SavedTravelPlan | null> {
    const [trip] = await this.db.select().from(trips).where(and(eq(trips.id, id), eq(trips.userId, userId))).limit(1);
    if (!trip) return null;

    const dayRows = await this.db.select().from(travelDays).where(eq(travelDays.tripId, id)).orderBy(asc(travelDays.dayNumber));
    const dayIds = dayRows.map((day) => day.id);
    const blockRows = dayIds.length
      ? await this.db.select().from(travelBlocks).where(inArray(travelBlocks.dayId, dayIds)).orderBy(asc(travelBlocks.position))
      : [];
    const connectionRows = dayIds.length
      ? await this.db.select().from(travelConnections).where(inArray(travelConnections.dayId, dayIds))
      : [];

    const blocksByDay = new Map<string, TravelBlock[]>();
    for (const row of blockRows) {
      const blocks = blocksByDay.get(row.dayId) ?? [];
      blocks.push(TravelBlockSchema.parse(row.data));
      blocksByDay.set(row.dayId, blocks);
    }
    const connections: TravelConnection[] = connectionRows.map((row) => TravelConnectionSchema.parse(row.data));
    const days = dayRows.map((day) => ({
      id: day.clientId,
      dayNumber: day.dayNumber,
      title: day.title,
      city: day.city ?? undefined,
      region: day.region ?? undefined,
      blocks: blocksByDay.get(day.id) ?? [],
    }));
    const form = {
      name: trip.name,
      country: trip.country,
      city: trip.city,
      duration: trip.duration,
      budget: trip.budget,
      travelers: trip.travelers,
      style: trip.style,
      description: trip.description,
    };
    return {
      id: trip.id,
      title: trip.name,
      subtitle: [trip.duration, trip.style].filter(Boolean).join(' · '),
      trip: form,
      days,
      connections,
      version: trip.version,
      createdAt: trip.createdAt.toISOString(),
      updatedAt: trip.updatedAt.toISOString(),
    };
  }

  async update(userId: string, id: string, payload: TravelPlanPayload, version: number): Promise<SavedTravelPlan | null | 'conflict'> {
    const updated = await this.db.transaction(async (tx) => {
      const rows = await tx.update(trips)
        .set({ ...payload.trip, version: version + 1, updatedAt: new Date() })
        .where(and(eq(trips.id, id), eq(trips.userId, userId), eq(trips.version, version)))
        .returning({ id: trips.id });
      if (!rows[0]) return false;
      await this.replaceChildren(tx, id, payload);
      return true;
    });
    if (!updated) return (await this.get(userId, id)) ? 'conflict' : null;
    return this.get(userId, id);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const rows = await this.db.delete(trips).where(and(eq(trips.id, id), eq(trips.userId, userId))).returning({ id: trips.id });
    return rows.length > 0;
  }

  private async replaceChildren(tx: any, tripId: string, payload: TravelPlanPayload): Promise<void> {
    await tx.delete(travelDays).where(eq(travelDays.tripId, tripId));
    for (const day of payload.days) {
      const [savedDay] = await tx.insert(travelDays).values({
        tripId,
        clientId: day.id,
        dayNumber: day.dayNumber,
        title: day.title,
        city: day.city,
        region: day.region,
      }).returning({ id: travelDays.id });
      if (!savedDay) throw new Error('TRAVEL_DAY_CREATE_FAILED');
      if (day.blocks.length) {
        await tx.insert(travelBlocks).values(day.blocks.map((block, position) => ({
          dayId: savedDay.id,
          clientId: block.id,
          position,
          data: block,
        })));
      }
      const connections = payload.connections.filter((connection) => connection.dayId === day.id);
      if (connections.length) {
        await tx.insert(travelConnections).values(connections.map((connection) => ({
          dayId: savedDay.id,
          clientId: connection.id,
          data: connection,
        })));
      }
    }
  }
}
