-- Platform-wide operator settings (singleton) for issue #1278.
-- Cross-client business/infra knobs configured from the top-level /admin
-- operator area — distinct from per-user `settings` and per-org
-- `organization_settings`. A single canonical row is enforced by the unique
-- `key` sentinel (default 'platform'). First knob: marginMultiplier, applied
-- on top of the base provider-cost markup in the model cost→price calculation.

CREATE TABLE "platform_settings" (
  "id" TEXT NOT NULL,
  "mongoId" TEXT,
  "key" TEXT NOT NULL DEFAULT 'platform',
  "marginMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_settings_mongoId_key" ON "platform_settings"("mongoId");
CREATE UNIQUE INDEX "platform_settings_key_key" ON "platform_settings"("key");
