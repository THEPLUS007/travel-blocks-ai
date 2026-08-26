CREATE UNIQUE INDEX IF NOT EXISTS travel_days_trip_client_id_idx ON travel_days(trip_id, client_id);
CREATE UNIQUE INDEX IF NOT EXISTS travel_blocks_day_client_id_idx ON travel_blocks(day_id, client_id);
CREATE UNIQUE INDEX IF NOT EXISTS travel_connections_day_client_id_idx ON travel_connections(day_id, client_id);
CREATE INDEX IF NOT EXISTS travel_sources_trip_id_idx ON travel_sources(trip_id);
CREATE INDEX IF NOT EXISTS ai_generation_runs_trip_id_idx ON ai_generation_runs(trip_id);
