-- Durable scheduler release groups and channel-target metadata (#1127).
-- Existing posts.groupId values predate this domain, so this migration keeps
-- groupId as a soft link and avoids a backfilled FK that could reject legacy
-- batch groups during deploy.

CREATE TABLE "post_groups" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "brandId" TEXT,
  "title" TEXT NOT NULL,
  "baseContent" TEXT NOT NULL,
  "media" JSONB NOT NULL DEFAULT '[]',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "scheduledAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "recurrence" JSONB,
  "idempotencyKey" TEXT,
  "attachments" JSONB NOT NULL DEFAULT '[]',
  "statusTransitions" JSONB NOT NULL DEFAULT '[]',
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "post_groups_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "posts"
  ADD COLUMN "targetSettings" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "targetAttachments" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "targetValidationState" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "targetValidationIssues" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "targetReadiness" JSONB,
  ADD COLUMN "targetExecutionState" TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN "targetError" JSONB,
  ADD COLUMN "targetIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "post_groups_organizationId_idempotencyKey_key"
  ON "post_groups"("organizationId", "idempotencyKey");

CREATE INDEX "post_groups_org_status_schedule_idx"
  ON "post_groups"("organizationId", "isDeleted", "status", "scheduledAt" ASC, "id");

CREATE INDEX "post_groups_brand_status_schedule_idx"
  ON "post_groups"("brandId", "isDeleted", "status", "scheduledAt" ASC, "id");

CREATE INDEX "post_groups_owner_created_idx"
  ON "post_groups"("ownerId", "isDeleted", "createdAt" DESC);

CREATE UNIQUE INDEX "posts_organizationId_targetIdempotencyKey_key"
  ON "posts"("organizationId", "targetIdempotencyKey");

CREATE INDEX "posts_group_target_execution_idx"
  ON "posts"("organizationId", "groupId", "targetExecutionState", "isDeleted");

ALTER TABLE "post_groups"
  ADD CONSTRAINT "post_groups_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "post_groups"
  ADD CONSTRAINT "post_groups_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "post_groups"
  ADD CONSTRAINT "post_groups_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "brands"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
