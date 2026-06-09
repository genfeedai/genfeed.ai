/*
  Enum -> text reconciliation (data-preserving, hand-edited).

  Prisma's auto-generated migration dropped and recreated the enum-backed
  `status`/`platform` columns, which would reset every existing row to the
  column default (and `posts.platform NOT NULL` would fail outright on a
  populated table). Prod has real rows (posts, workflows, tasks), so each
  enum->text conversion below uses
      ALTER COLUMN <col> TYPE TEXT USING lower(<col>::text)
  to preserve existing values while lowercasing the legacy UPPERCASE enum
  labels (e.g. 'PUBLISHED' -> 'published') to match the application enums.
  The legacy enum types are left in place (some are still referenced by
  other tables, e.g. CredentialPlatform).
*/
-- DropForeignKey
ALTER TABLE "models" DROP CONSTRAINT "models_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "presets" DROP CONSTRAINT "presets_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "skills" DROP CONSTRAINT "skills_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "templates" DROP CONSTRAINT "templates_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "trends" DROP CONSTRAINT "trends_organizationId_fkey";

-- DropIndex
DROP INDEX "tracked_links_shortCode_idx";

-- AlterTable
ALTER TABLE "agent_memories" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "importance" DOUBLE PRECISION,
ADD COLUMN     "kind" TEXT,
ADD COLUMN     "performanceSnapshot" JSONB,
ADD COLUMN     "platform" TEXT,
ADD COLUMN     "scope" TEXT,
ADD COLUMN     "sourceContentId" TEXT,
ADD COLUMN     "sourceMessageId" TEXT,
ADD COLUMN     "sourceType" TEXT,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "agent_threads" ADD COLUMN     "status" TEXT DEFAULT 'active';

-- AlterTable
ALTER TABLE "brand_memories" ADD COLUMN     "date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "campaign_targets" ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "replyExternalId" TEXT,
ADD COLUMN     "replyText" TEXT,
ADD COLUMN     "replyUrl" TEXT,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "skipReason" TEXT;
ALTER TABLE "campaign_targets" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "campaign_targets" ALTER COLUMN "status" TYPE TEXT USING lower("status"::text);
ALTER TABLE "campaign_targets" ALTER COLUMN "status" SET DEFAULT 'pending';
ALTER TABLE "campaign_targets" ALTER COLUMN "status" SET NOT NULL;

-- AlterTable
ALTER TABLE "clip_results" ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "providerJobId" TEXT,
ADD COLUMN     "viralityScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "content_drafts" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "content" TEXT,
ADD COLUMN     "generatedBy" TEXT,
ADD COLUMN     "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "skillSlug" TEXT,
ADD COLUMN     "type" TEXT;
ALTER TABLE "content_drafts" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "content_drafts" ALTER COLUMN "status" TYPE TEXT USING lower("status"::text);
ALTER TABLE "content_drafts" ALTER COLUMN "status" SET DEFAULT 'draft';
ALTER TABLE "content_drafts" ALTER COLUMN "status" SET NOT NULL;

-- AlterTable
ALTER TABLE "content_performance" ADD COLUMN     "comments" INTEGER,
ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "cycleNumber" INTEGER,
ADD COLUMN     "engagementRate" DOUBLE PRECISION,
ADD COLUMN     "externalPostId" TEXT,
ADD COLUMN     "likes" INTEGER,
ADD COLUMN     "measuredAt" TIMESTAMP(3),
ADD COLUMN     "performanceScore" DOUBLE PRECISION,
ADD COLUMN     "revenue" DOUBLE PRECISION,
ADD COLUMN     "saves" INTEGER,
ADD COLUMN     "shares" INTEGER,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "views" INTEGER;

-- AlterTable
ALTER TABLE "content_schedules" ADD COLUMN     "cronExpression" TEXT,
ADD COLUMN     "isEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastRunAt" TIMESTAMP(3),
ADD COLUMN     "name" TEXT,
ADD COLUMN     "nextRunAt" TIMESTAMP(3),
ADD COLUMN     "skillParams" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "skillSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- AlterTable
ALTER TABLE "credit_transactions" ADD COLUMN     "category" TEXT;

-- AlterTable
ALTER TABLE "desktop_auth_codes" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "font_families" ALTER COLUMN "organizationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "models" ALTER COLUMN "organizationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "outreach_campaigns" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "outreach_campaigns" ALTER COLUMN "status" TYPE TEXT USING lower("status"::text);
ALTER TABLE "outreach_campaigns" ALTER COLUMN "status" SET DEFAULT 'draft';
ALTER TABLE "outreach_campaigns" ALTER COLUMN "status" SET NOT NULL;

-- AlterTable
ALTER TABLE "personas" ADD COLUMN     "avatarExternalId" TEXT,
ADD COLUMN     "avatarProvider" TEXT,
ADD COLUMN     "handle" TEXT,
ADD COLUMN     "profileImageUrl" TEXT,
ADD COLUMN     "voiceExternalId" TEXT,
ADD COLUMN     "voiceProvider" TEXT;

-- AlterTable
ALTER TABLE "posts" ALTER COLUMN "platform" DROP DEFAULT;
ALTER TABLE "posts" ALTER COLUMN "platform" TYPE TEXT USING lower("platform"::text);
ALTER TABLE "posts" ALTER COLUMN "platform" SET NOT NULL;
ALTER TABLE "posts" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "posts" ALTER COLUMN "status" TYPE TEXT USING lower("status"::text);
ALTER TABLE "posts" ALTER COLUMN "status" SET DEFAULT 'scheduled';
ALTER TABLE "posts" ALTER COLUMN "status" SET NOT NULL;

-- AlterTable
ALTER TABLE "presets" ALTER COLUMN "organizationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "repurposing_jobs" ADD COLUMN     "results" JSONB,
ADD COLUMN     "settings" JSONB,
ADD COLUMN     "sourceContentId" TEXT,
ADD COLUMN     "sourceContentType" TEXT,
ADD COLUMN     "targetFormats" JSONB;

-- AlterTable
ALTER TABLE "runs" ADD COLUMN     "actionType" TEXT,
ADD COLUMN     "authType" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "correlationId" TEXT,
ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "events" JSONB,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "input" JSONB,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "output" JSONB,
ADD COLUMN     "progress" INTEGER,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT,
ADD COLUMN     "surface" TEXT,
ADD COLUMN     "traceId" TEXT,
ADD COLUMN     "trigger" TEXT,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "schedules" ADD COLUMN     "contentId" TEXT,
ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "schedulingMethod" TEXT;
ALTER TABLE "schedules" ALTER COLUMN "platform" DROP DEFAULT;
ALTER TABLE "schedules" ALTER COLUMN "platform" TYPE TEXT USING lower("platform"::text);

-- AlterTable
ALTER TABLE "skills" ALTER COLUMN "organizationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "approvedOutputIds" TEXT[],
ADD COLUMN     "checkedOutAt" TIMESTAMP(3),
ADD COLUMN     "checkoutAgentId" TEXT,
ADD COLUMN     "checkoutRunId" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "dismissedAt" TIMESTAMP(3),
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "requestedChangesReason" TEXT;
ALTER TABLE "tasks" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tasks" ALTER COLUMN "status" TYPE TEXT USING lower("status"::text);
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'pending';
ALTER TABLE "tasks" ALTER COLUMN "status" SET NOT NULL;

-- AlterTable
ALTER TABLE "template_metadata" ADD COLUMN     "author" TEXT,
ADD COLUMN     "averageQuality" DOUBLE PRECISION,
ADD COLUMN     "compatiblePlatforms" TEXT[],
ADD COLUMN     "lastUsed" TIMESTAMP(3),
ADD COLUMN     "license" TEXT,
ADD COLUMN     "successRate" DOUBLE PRECISION,
ADD COLUMN     "usageCount" INTEGER DEFAULT 0,
ADD COLUMN     "version" TEXT;

-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "category" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "isActive" BOOLEAN,
ADD COLUMN     "usageCount" INTEGER,
ADD COLUMN     "variables" JSONB,
ADD COLUMN     "version" INTEGER,
ALTER COLUMN "organizationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tracked_links" ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "trends" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "isCurrent" BOOLEAN,
ADD COLUMN     "platform" TEXT,
ADD COLUMN     "requiresAuth" BOOLEAN,
ADD COLUMN     "topic" TEXT,
ADD COLUMN     "viralityScore" DOUBLE PRECISION,
ALTER COLUMN "organizationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "watchlists" ADD COLUMN     "handle" TEXT,
ADD COLUMN     "platform" TEXT;

-- AlterTable
ALTER TABLE "workflows" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "executionCount" INTEGER,
ADD COLUMN     "isScheduleEnabled" BOOLEAN,
ADD COLUMN     "lastExecutedAt" TIMESTAMP(3),
ADD COLUMN     "lifecycle" TEXT,
ADD COLUMN     "lockedNodeIds" JSONB,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "progress" INTEGER,
ADD COLUMN     "recurrence" JSONB,
ADD COLUMN     "schedule" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "thumbnail" TEXT,
ADD COLUMN     "thumbnailNodeId" TEXT,
ADD COLUMN     "timezone" TEXT;
ALTER TABLE "workflows" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "workflows" ALTER COLUMN "status" TYPE TEXT USING lower("status"::text);
ALTER TABLE "workflows" ALTER COLUMN "status" SET DEFAULT 'draft';
ALTER TABLE "workflows" ALTER COLUMN "status" SET NOT NULL;

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "mongoId" TEXT,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_mongoId_key" ON "projects"("mongoId");

-- CreateIndex
CREATE INDEX "projects_organizationId_isDeleted_idx" ON "projects"("organizationId", "isDeleted");

-- CreateIndex
CREATE INDEX "brand_memories_organizationId_brandId_date_idx" ON "brand_memories"("organizationId", "brandId", "date");

-- CreateIndex
CREATE INDEX "campaign_targets_campaignId_status_idx" ON "campaign_targets"("campaignId", "status");

-- CreateIndex
CREATE INDEX "clip_results_organizationId_projectId_idx" ON "clip_results"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "clip_results_providerJobId_idx" ON "clip_results"("providerJobId");

-- CreateIndex
CREATE INDEX "content_drafts_organizationId_brandId_isDeleted_idx" ON "content_drafts"("organizationId", "brandId", "isDeleted");

-- CreateIndex
CREATE INDEX "content_performance_measuredAt_idx" ON "content_performance"("measuredAt");

-- CreateIndex
CREATE INDEX "content_performance_cycleNumber_idx" ON "content_performance"("cycleNumber");

-- CreateIndex
CREATE INDEX "content_schedules_isEnabled_nextRunAt_idx" ON "content_schedules"("isEnabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "content_schedules_organizationId_brandId_idx" ON "content_schedules"("organizationId", "brandId");

-- NOTE: posts status indexes (posts_isDeleted_parentId_scheduledDate_status_idx,
-- posts_isDeleted_organizationId_status_idx, posts_brandId_isDeleted_status_idx,
-- posts_isDeleted_nextScheduledDate_status_idx) already exist from the init
-- migration with identical definitions. The data-preserving ALTER COLUMN ... TYPE
-- above keeps the column and its indexes (Postgres rebuilds them in place), so they
-- are intentionally NOT recreated here (Prisma's destructive version recreated them
-- only because it dropped the column first).

-- CreateIndex
CREATE INDEX "tasks_organizationId_checkoutAgentId_idx" ON "tasks"("organizationId", "checkoutAgentId");

-- AddForeignKey
ALTER TABLE "models" ADD CONSTRAINT "models_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trends" ADD CONSTRAINT "trends_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presets" ADD CONSTRAINT "presets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
