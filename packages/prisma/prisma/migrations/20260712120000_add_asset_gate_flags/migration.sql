-- First-asset unlock gate (cloud SaaS progressive-disclosure onboarding).
--
-- `organization_settings.hasGeneratedFirstAsset` — durable org signal that flips
-- true the first time the org completes a generation (Ingredient -> GENERATED).
-- The auth bootstrap payload reads it to unlock the main app nav sections.
--
-- `users.hasDismissedAssetGate` — per-user "explore anyway" escape hatch that
-- permanently clears the locked/teaser UI for that user.
--
-- Both default false. New orgs/users therefore start LOCKED, which is correct for
-- brand-new accounts. Existing accounts must NOT be retroactively locked: the
-- backfill below sets the org flag true for every org that already has at least
-- one GENERATED, non-deleted ingredient. Orgs with no generated asset yet stay
-- false and see the gate (matching intended new-account behavior).

ALTER TABLE "organization_settings"
  ADD COLUMN "hasGeneratedFirstAsset" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "users"
  ADD COLUMN "hasDismissedAssetGate" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any org that has already produced a generated asset is "past" the
-- gate. A generated Ingredient does not stay in GENERATED forever — it advances
-- to VALIDATED after review and can end up ARCHIVED/REJECTED — so matching only
-- current `GENERATED` rows would wrongly LOCK established orgs whose assets have
-- moved on. We therefore treat every at-or-past-generation status as "generated"
-- and deliberately EXCLUDE the pre-generation / non-generation states
-- (DRAFT, PROCESSING, UPLOADED, FAILED). Biasing toward unlock is safe: the cost
-- of a false lock (annoying an active org) far outweighs a false unlock (showing
-- full nav to an org that only uploaded). Idempotent.
UPDATE "organization_settings" AS os
SET "hasGeneratedFirstAsset" = true
WHERE os."hasGeneratedFirstAsset" = false
  AND EXISTS (
    SELECT 1
    FROM "ingredients" AS i
    WHERE i."organizationId" = os."organizationId"
      AND i."status" IN ('GENERATED', 'VALIDATED', 'ARCHIVED', 'REJECTED')
      AND i."isDeleted" = false
  );
