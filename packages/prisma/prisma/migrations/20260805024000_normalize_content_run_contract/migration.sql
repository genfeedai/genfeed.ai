UPDATE "content_runs"
SET "config" = COALESCE("config", '{}'::jsonb)
  - '_id'
  - 'brand'
  - 'organization'
WHERE "config" ?| ARRAY['_id', 'brand', 'organization'];
