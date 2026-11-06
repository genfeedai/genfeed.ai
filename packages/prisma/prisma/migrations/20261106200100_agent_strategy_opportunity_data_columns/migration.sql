-- Promote the `agent_strategy_opportunities.data` keys the opportunity queue
-- filters and ranks on to real columns. The autopilot and the opportunity list
-- read open opportunities by `status`, exclude the conversation queue by
-- `sourceType`, rank by `priorityScore`, and dedupe new opportunities by
-- `sourceType` + `topic` + `sourceRef`. Each of those read `data` for every
-- candidate row, and the ranked page could not use an index at all.
--
-- Opportunity data is rewritten on every status change, so the trigger
-- recomputes the columns on INSERT and on every UPDATE of `data`. The next
-- migration backfills existing rows. Values are copied only when the JSON type
-- matches what the old filters matched (strings; numbers for the score).
--
-- Additive: nullable columns (metadata-only change), so the running release
-- keeps working while this applies.

ALTER TABLE "agent_strategy_opportunities"
  ADD COLUMN IF NOT EXISTS "status" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceType" TEXT,
  ADD COLUMN IF NOT EXISTS "topic" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceRef" TEXT,
  ADD COLUMN IF NOT EXISTS "priorityScore" DOUBLE PRECISION;

CREATE OR REPLACE FUNCTION "promote_agent_strategy_opportunity_data"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."status" := "jsonb_text_at"(NEW."data", '{status}');
  NEW."sourceType" := "jsonb_text_at"(NEW."data", '{sourceType}');
  NEW."topic" := "jsonb_text_at"(NEW."data", '{topic}');
  NEW."sourceRef" := "jsonb_text_at"(NEW."data", '{sourceRef}');
  NEW."priorityScore" := "jsonb_number_at"(NEW."data", '{priorityScore}');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "agent_strategy_opportunity_data_promotion" ON "agent_strategy_opportunities";

CREATE TRIGGER "agent_strategy_opportunity_data_promotion"
BEFORE INSERT OR UPDATE OF "data" ON "agent_strategy_opportunities"
FOR EACH ROW
EXECUTE FUNCTION "promote_agent_strategy_opportunity_data"();
