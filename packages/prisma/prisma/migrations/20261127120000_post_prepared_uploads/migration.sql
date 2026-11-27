-- Instagram uploads made before a scheduled post is due (#11515). The prepare
-- sweep creates the media container a few minutes early and the delivery only
-- calls media_publish at the due time. Expand only: one new, empty table.

CREATE TABLE IF NOT EXISTS "post_prepared_uploads" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "occurrenceKey" TEXT NOT NULL,
  "inputDigest" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "leaseToken" TEXT NOT NULL,
  "leaseRenewedAt" TIMESTAMP(3) NOT NULL,
  "providerUploadId" TEXT,
  "expiresAt" TIMESTAMP(3),
  "consumedByAttempt" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "post_prepared_uploads_pkey" PRIMARY KEY ("id"),
  -- PostPreparedUploadStatus in @genfeedai/contracts.
  CONSTRAINT "post_prepared_uploads_status_check"
    CHECK ("status" IN ('preparing', 'ready', 'consumed', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "post_prepared_uploads_occurrence_key"
  ON "post_prepared_uploads" ("organizationId", "postId", "occurrenceKey");

ALTER TABLE "post_prepared_uploads"
  DROP CONSTRAINT IF EXISTS "post_prepared_uploads_organizationId_fkey",
  ADD CONSTRAINT "post_prepared_uploads_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "post_prepared_uploads"
  DROP CONSTRAINT IF EXISTS "post_prepared_uploads_postId_fkey",
  ADD CONSTRAINT "post_prepared_uploads_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "posts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
