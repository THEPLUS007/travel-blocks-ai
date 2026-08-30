import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionHash: text('session_hash').notNull(),
  ...timestamps,
}, (table) => [uniqueIndex('users_session_hash_idx').on(table.sessionHash)]);

export const trips = pgTable('trips', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  country: text('country').notNull(),
  city: text('city').notNull(),
  duration: text('duration').notNull(),
  budget: text('budget').notNull(),
  travelers: text('travelers').notNull(),
  style: text('style').notNull(),
  description: text('description').notNull(),
  version: integer('version').notNull().default(1),
  ...timestamps,
}, (table) => [index('trips_user_id_idx').on(table.userId)]);

export const travelDays = pgTable('travel_days', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull(),
  dayNumber: integer('day_number').notNull(),
  title: text('title').notNull(),
  city: text('city'),
  region: text('region'),
  ...timestamps,
}, (table) => [
  index('travel_days_trip_id_idx').on(table.tripId),
  uniqueIndex('travel_days_trip_client_id_idx').on(table.tripId, table.clientId),
]);

export const travelBlocks = pgTable('travel_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  dayId: uuid('day_id').notNull().references(() => travelDays.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull(),
  position: integer('position').notNull(),
  data: jsonb('data').notNull(),
  ...timestamps,
}, (table) => [
  index('travel_blocks_day_id_idx').on(table.dayId),
  uniqueIndex('travel_blocks_day_client_id_idx').on(table.dayId, table.clientId),
]);

export const travelConnections = pgTable('travel_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  dayId: uuid('day_id').notNull().references(() => travelDays.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull(),
  data: jsonb('data').notNull(),
  ...timestamps,
}, (table) => [
  index('travel_connections_day_id_idx').on(table.dayId),
  uniqueIndex('travel_connections_day_client_id_idx').on(table.dayId, table.clientId),
]);

export const travelSources = pgTable('travel_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  contentHash: text('content_hash').notNull(),
  ...timestamps,
}, (table) => [index('travel_sources_trip_id_idx').on(table.tripId)]);

export const aiGenerationRuns = pgTable('ai_generation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  task: text('task').notNull(),
  status: text('status').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  errorCode: text('error_code'),
  ...timestamps,
}, (table) => [index('ai_generation_runs_trip_id_idx').on(table.tripId)]);
