-- Version-bound publish approvals for #1680. Approval scope is explicit and
-- mutable execution state is separate from immutable content_version_pins.

BEGIN;

CREATE TABLE "publish_approvals" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "artifactVersionPinId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "contextVersion" INTEGER,
  "destinations" JSONB NOT NULL,
  "scheduleIntent" JSONB NOT NULL,
  "policy" JSONB NOT NULL,
  "provenance" JSONB NOT NULL DEFAULT '{}',
  "scopeDigest" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'approved',
  "statusTransitions" JSONB NOT NULL DEFAULT '[]',
  "invalidatedAt" TIMESTAMP(3),
  "invalidationReason" TEXT,
  "executedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "publish_approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "publish_approvals_status_check" CHECK (
    "status" IN (
      'approved',
      'queued',
      'executing',
      'published',
      'failed',
      'cancelled',
      'invalidated'
    )
  ),
  CONSTRAINT "publish_approvals_destinations_check" CHECK (
    jsonb_typeof("destinations") = 'array' AND jsonb_array_length("destinations") > 0
  ),
  CONSTRAINT "publish_approvals_scope_digest_check" CHECK (
    "scopeDigest" ~ '^sha256:v1:[0-9a-f]{64}$'
  ),
  CONSTRAINT "publish_approvals_operation_id_check" CHECK (
    "operationId" ~ '^sha256:v1:[0-9a-f]{64}$'
  ),
  CONSTRAINT "publish_approvals_org_operation_key" UNIQUE (
    "organizationId",
    "operationId"
  ),
  CONSTRAINT "publish_approvals_org_post_scope_key" UNIQUE (
    "organizationId",
    "postId",
    "scopeDigest"
  ),
  CONSTRAINT "publish_approvals_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "publish_approvals_brandId_organizationId_fkey"
    FOREIGN KEY ("brandId", "organizationId")
    REFERENCES "brands"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "publish_approvals_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "posts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "publish_approvals_artifactVersionPinId_organizationId_fkey"
    FOREIGN KEY ("artifactVersionPinId", "organizationId")
    REFERENCES "content_version_pins"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "publish_approvals_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "publish_approvals_scope_status_idx"
ON "publish_approvals"("organizationId", "brandId", "status", "createdAt" DESC);

CREATE INDEX "publish_approvals_post_status_idx"
ON "publish_approvals"("postId", "status", "createdAt" DESC);

ALTER TABLE "posts" ADD COLUMN "publishApprovalId" TEXT;

ALTER TABLE "posts"
ADD CONSTRAINT "posts_publishApprovalId_key" UNIQUE ("publishApprovalId");

ALTER TABLE "posts"
ADD CONSTRAINT "posts_publishApprovalId_fkey"
FOREIGN KEY ("publishApprovalId") REFERENCES "publish_approvals"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
