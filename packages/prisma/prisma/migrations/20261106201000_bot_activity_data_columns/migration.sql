-- Promote the `bot_activities.data` keys the reply bot filters on to real
-- columns. Each poll checks a comment's needs-review hold by `triggerTweetId` +
-- `isIntentNeedsReview`; the activity list filters by `status` and `botType`;
-- the stats panel and the daily manual-reply cap count by `status`,
-- `replyTweetId`, `dmSent` and `isManuallyPosted`. Each of those read `data` for
-- every candidate row.
--
-- Activity data is rewritten as an activity progresses, so the trigger
-- recomputes the columns on INSERT and on every UPDATE of `data`. The next
-- migration backfills existing rows. Values are copied only when the JSON type
-- matches what the old filters matched: strings, and JSON `true` for the flags.
--
-- Additive: nullable columns and constant defaults (metadata-only changes), so
-- the running release keeps working while this applies.

ALTER TABLE "bot_activities"
  ADD COLUMN IF NOT EXISTS "status" TEXT,
  ADD COLUMN IF NOT EXISTS "botType" TEXT,
  ADD COLUMN IF NOT EXISTS "triggerTweetId" TEXT,
  ADD COLUMN IF NOT EXISTS "replyTweetId" TEXT,
  ADD COLUMN IF NOT EXISTS "dmSent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isManuallyPosted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isIntentNeedsReview" BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION "promote_bot_activity_data"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."status" := "jsonb_text_at"(NEW."data", '{status}');
  NEW."botType" := "jsonb_text_at"(NEW."data", '{botType}');
  NEW."triggerTweetId" := "jsonb_text_at"(NEW."data", '{triggerTweetId}');
  NEW."replyTweetId" := "jsonb_text_at"(NEW."data", '{replyTweetId}');
  NEW."dmSent" := "jsonb_true_at"(NEW."data", '{dmSent}');
  NEW."isManuallyPosted" := "jsonb_true_at"(NEW."data", '{isManuallyPosted}');
  NEW."isIntentNeedsReview" := "jsonb_true_at"(NEW."data", '{isIntentNeedsReview}');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "bot_activity_data_promotion" ON "bot_activities";

CREATE TRIGGER "bot_activity_data_promotion"
BEFORE INSERT OR UPDATE OF "data" ON "bot_activities"
FOR EACH ROW
EXECUTE FUNCTION "promote_bot_activity_data"();
