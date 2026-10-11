-- Server-only platform-authority marker for seeded system workflows (#6689, lane H).
-- Nullable and unset for every existing row: no metadata backfill, because tenants can forge the
-- seeded-template metadata. The seeder's reconcile path marks a row only after it matches the
-- canonical template server-side.
ALTER TABLE "workflows" ADD COLUMN "platformSeedKey" TEXT;

-- At most one live platform-marked row per template per organization.
CREATE UNIQUE INDEX "workflows_platform_seed_key_org_uidx"
  ON "workflows" ("organizationId", "platformSeedKey")
  WHERE "platformSeedKey" IS NOT NULL
    AND "isDeleted" = false;
