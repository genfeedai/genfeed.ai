BEGIN;
ALTER TABLE "content_learning_baselines"
  ADD COLUMN "snapshotEvidenceRevision" INTEGER,
  ADD COLUMN "snapshotEpoch" INTEGER,
  ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "content_learning_baselines"
  ADD CONSTRAINT "learning_baseline_materialization_metadata_check" CHECK (
    ("snapshotEvidenceRevision" IS NULL AND "snapshotEpoch" IS NULL AND "expiresAt" IS NULL)
    OR
    ("snapshotEvidenceRevision" IS NOT NULL AND "snapshotEvidenceRevision" >= 0
      AND "snapshotEpoch" IS NOT NULL AND "snapshotEpoch" >= 0
      AND (("count" = 0 AND "expiresAt" IS NULL)
        OR ("count" > 0 AND "expiresAt" IS NOT NULL AND "expiresAt" >= "cutoff")))
  );
CREATE INDEX "learning_baseline_materialization_lookup_idx"
  ON "content_learning_baselines" ("organizationId", "credentialId", "scopeKey", "snapshotEpoch", "snapshotEvidenceRevision", "cutoff" DESC, "id" DESC);
COMMIT;
