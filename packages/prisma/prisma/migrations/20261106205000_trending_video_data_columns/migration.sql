-- Promote the `trending_videos` keys that queries filter on (#9359): `isCurrent`,
-- `expiresAt`, `platform` and `lookupKey` (the external video id, the refresh
-- dedupe key).
-- The expiry sweep and the refresh dedupe used to load whole rows into the API
-- to read these keys; the columns let both run in SQL.
--
-- The trigger recomputes the columns from `data` on every write, so `data`
-- stays the only thing writers set. `lookupKey` is left NULL past 512
-- characters so its index entry always fits; such a row is simply never
-- matched by the dedupe.

ALTER TABLE "trending_videos"
  ADD COLUMN IF NOT EXISTS "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "platform" TEXT,
  ADD COLUMN IF NOT EXISTS "lookupKey" TEXT;

CREATE OR REPLACE FUNCTION "promote_trending_video_data"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."isCurrent" := "jsonb_true_at"(NEW."data", '{isCurrent}');
  NEW."expiresAt" := "jsonb_timestamp_at"(NEW."data", '{expiresAt}');
  NEW."platform" := "jsonb_text_at"(NEW."data", '{platform}');
  NEW."lookupKey" := CASE WHEN length("jsonb_text_at"(NEW."data", '{externalId}')) <= 512 THEN "jsonb_text_at"(NEW."data", '{externalId}') END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trending_video_data_promotion" ON "trending_videos";

CREATE TRIGGER "trending_video_data_promotion"
BEFORE INSERT OR UPDATE OF "data" ON "trending_videos"
FOR EACH ROW
EXECUTE FUNCTION "promote_trending_video_data"();
