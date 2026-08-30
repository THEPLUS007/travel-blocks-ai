ALTER TABLE ai_generation_runs ADD COLUMN task text;
ALTER TABLE ai_generation_runs ADD COLUMN latency_ms integer;
UPDATE ai_generation_runs SET task = 'legacy' WHERE task IS NULL;
UPDATE ai_generation_runs SET latency_ms = 0 WHERE latency_ms IS NULL;
ALTER TABLE ai_generation_runs ALTER COLUMN task SET NOT NULL;
ALTER TABLE ai_generation_runs ALTER COLUMN latency_ms SET NOT NULL;
