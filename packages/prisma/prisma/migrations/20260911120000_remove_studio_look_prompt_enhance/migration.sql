-- #4676: Prompt enhance never enhanced a prompt and collapsed onto
-- `brandingMode`, silently suppressing branding for looks that had it off.
-- Brand voice (`brandingMode`) is now the single, truthful branding flag.
--
-- Backfill first: a look saved with enhance off previously ran with
-- branding effectively off, regardless of its stored `brandingMode`. Without
-- this, dropping the column would silently flip those looks to branding on.
UPDATE "studio_looks"
SET "brandingMode" = 'off'
WHERE "isPromptEnhanceEnabled" = false;

ALTER TABLE "studio_looks" DROP COLUMN "isPromptEnhanceEnabled";
