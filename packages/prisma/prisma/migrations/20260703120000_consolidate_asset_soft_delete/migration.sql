-- Consolidate Asset soft-delete onto the single repo-wide convention `isDeleted`
-- (#1185, epic #1176). The `assets` table was the ONLY model carrying both
-- `deletedAt DateTime?` and `isDeleted Boolean` — the one place two competing
-- soft-delete conventions coexisted, exactly the inconsistency that leads a
-- future contributor to copy the wrong pattern.
--
-- Data-conflict resolution (documented decision, per PRD NFR)
-- ----------------------------------------------------------
-- Business rule: a row with `deletedAt` set counts as deleted. This is not a
-- new decision — the desktop-sync read path already unioned the two signals
-- (`existing.deletedAt || existing.isDeleted`) and the delete writer set BOTH
-- fields together, so at runtime a non-null `deletedAt` was already treated as
-- deleted. We therefore backfill `isDeleted = true` wherever `deletedAt` is set
-- but `isDeleted` is still false BEFORE dropping the column, so no delete state
-- is lost. The reverse case (`isDeleted = true`, `deletedAt` null) is already
-- fully represented by `isDeleted` and needs no action.
--
-- `updatedAt` is intentionally NOT bumped: these rows were already effectively
-- deleted and already tombstoned on desktop clients, so re-stamping them would
-- trigger a needless re-sync without changing any observable state.

-- Step 1: Preserve delete state from the column being removed.
UPDATE "assets"
SET    "isDeleted" = true
WHERE  "deletedAt" IS NOT NULL
  AND  "isDeleted" = false;

-- Step 2: Drop the redundant soft-delete column. Idempotent for re-run safety.
ALTER TABLE "assets" DROP COLUMN IF EXISTS "deletedAt";
