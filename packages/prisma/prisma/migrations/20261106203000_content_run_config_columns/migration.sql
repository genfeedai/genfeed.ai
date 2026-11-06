-- Promote the `content_runs.config` keys run lookups filter on to real
-- columns. Storyboard and remix lists and lookups filter on `contract`, the
-- storyboard create path dedupes on `clientRequestId` + `createdByUserId`, the
-- remix compare-and-swap guards on `revision` + `phase`, prefilled-run reuse
-- matches `phase`, and the content-run list filters `skillSlug`. Each of those
-- read `config` for every candidate run.
--
-- Run config is rewritten as a run progresses, so the trigger recomputes the
-- columns on INSERT and on every UPDATE of `config`. The next migration
-- backfills existing rows. Values are copied only when the JSON type matches
-- what the old filters matched: strings, and numbers for `revision`.
--
-- Additive: nullable columns (metadata-only change), so the running release
-- keeps working while this applies.

ALTER TABLE "content_runs"
  ADD COLUMN IF NOT EXISTS "contract" TEXT,
  ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT,
  ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "skillSlug" TEXT,
  ADD COLUMN IF NOT EXISTS "phase" TEXT,
  ADD COLUMN IF NOT EXISTS "revision" DOUBLE PRECISION;

CREATE OR REPLACE FUNCTION "promote_content_run_config"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."contract" := "jsonb_text_at"(NEW."config", '{contract}');
  NEW."clientRequestId" := "jsonb_text_at"(NEW."config", '{clientRequestId}');
  NEW."createdByUserId" := "jsonb_text_at"(NEW."config", '{createdByUserId}');
  NEW."skillSlug" := "jsonb_text_at"(NEW."config", '{skillSlug}');
  NEW."phase" := "jsonb_text_at"(NEW."config", '{phase}');
  NEW."revision" := "jsonb_number_at"(NEW."config", '{revision}');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "content_run_config_promotion" ON "content_runs";

CREATE TRIGGER "content_run_config_promotion"
BEFORE INSERT OR UPDATE OF "config" ON "content_runs"
FOR EACH ROW
EXECUTE FUNCTION "promote_content_run_config"();
