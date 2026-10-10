CREATE UNIQUE INDEX "post_exposure_observations_receipt_scope_key" ON "post_exposure_observations"("id", "organizationId", "brandId", "credentialId");

CREATE TABLE "breakout_baseline_receipts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "targetObservationId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "optionsFingerprint" TEXT NOT NULL,
  "evidenceFingerprint" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "evaluation" JSONB NOT NULL,
  "evaluatedAt" TIMESTAMP(3) NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "breakout_baseline_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "breakout_baseline_receipts_target_scope_fkey" FOREIGN KEY ("targetObservationId", "organizationId", "brandId", "credentialId") REFERENCES "post_exposure_observations"("id", "organizationId", "brandId", "credentialId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "breakout_baseline_receipts_metric_check" CHECK ("metric" IN ('views', 'impressions'))
);
CREATE UNIQUE INDEX "breakout_baseline_receipts_id_organizationId_key" ON "breakout_baseline_receipts"("id", "organizationId");
CREATE UNIQUE INDEX "breakout_baseline_receipts_organizationId_idempotencyKey_key" ON "breakout_baseline_receipts"("organizationId", "idempotencyKey");
CREATE INDEX "breakout_baseline_receipts_scope_idx" ON "breakout_baseline_receipts"("organizationId", "brandId", "credentialId", "isDeleted", "evaluatedAt" DESC);
