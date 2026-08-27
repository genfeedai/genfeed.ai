-- Remaining #1123 surfaces: posting-set provenance, RSS autopost, engagement
-- rules, and agent publish audit.

BEGIN;

CREATE TYPE "rss_import_policy" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISH_NOW');
CREATE TYPE "rss_approval_mode" AS ENUM ('APPROVAL', 'AUTO');
CREATE TYPE "rss_feed_item_status" AS ENUM ('PENDING', 'IMPORTED', 'SKIPPED', 'FAILED');
CREATE TYPE "engagement_metric" AS ENUM ('LIKES', 'COMMENTS', 'SHARES', 'VIEWS', 'ENGAGEMENT_RATE');
CREATE TYPE "engagement_rule_action" AS ENUM ('REPOST', 'FOLLOW_UP_COMMENT');
CREATE TYPE "engagement_rule_mode" AS ENUM ('APPROVAL', 'AUTO');
CREATE TYPE "engagement_rule_state" AS ENUM ('ARMED', 'TRIGGERED', 'COMPLETED', 'EXPIRED', 'DISABLED');
CREATE TYPE "agent_publish_decision" AS ENUM ('PERMITTED', 'DENIED');

ALTER TABLE "post_groups"
  ADD COLUMN "postingSetId" TEXT,
  ADD COLUMN "rssSourceId" TEXT,
  ADD COLUMN "rssFeedItemId" TEXT;

CREATE TABLE "rss_sources" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT,
  "label" TEXT NOT NULL,
  "feedUrl" TEXT NOT NULL,
  "importPolicy" "rss_import_policy" NOT NULL DEFAULT 'DRAFT',
  "approvalMode" "rss_approval_mode" NOT NULL DEFAULT 'APPROVAL',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "targetChannels" JSONB NOT NULL DEFAULT '[]',
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "lastPolledAt" TIMESTAMP(3),
  "lastError" TEXT,
  "importedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rss_sources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rss_sources_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "rss_sources_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "rss_sources_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "brands"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "rss_sources_organizationId_isDeleted_isEnabled_createdAt_idx"
  ON "rss_sources"("organizationId", "isDeleted", "isEnabled", "createdAt" DESC);
CREATE INDEX "rss_sources_organizationId_brandId_isDeleted_createdAt_idx"
  ON "rss_sources"("organizationId", "brandId", "isDeleted", "createdAt" DESC);
CREATE INDEX "rss_sources_userId_isDeleted_createdAt_idx"
  ON "rss_sources"("userId", "isDeleted", "createdAt" DESC);

CREATE TABLE "rss_feed_items" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT,
  "rssSourceId" TEXT NOT NULL,
  "guid" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "imageUrl" TEXT,
  "publishedAt" TIMESTAMP(3),
  "status" "rss_feed_item_status" NOT NULL DEFAULT 'PENDING',
  "postGroupId" TEXT,
  "error" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rss_feed_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rss_feed_items_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "rss_feed_items_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "rss_feed_items_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "brands"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "rss_feed_items_rssSourceId_fkey"
    FOREIGN KEY ("rssSourceId") REFERENCES "rss_sources"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "rss_feed_items_rssSourceId_guid_key"
  ON "rss_feed_items"("rssSourceId", "guid");
CREATE INDEX "rss_feed_items_organizationId_isDeleted_status_createdAt_idx"
  ON "rss_feed_items"("organizationId", "isDeleted", "status", "createdAt" DESC);
CREATE INDEX "rss_feed_items_rssSourceId_isDeleted_status_idx"
  ON "rss_feed_items"("rssSourceId", "isDeleted", "status");

CREATE TABLE "engagement_rules" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT,
  "postGroupId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "metric" "engagement_metric" NOT NULL,
  "threshold" DOUBLE PRECISION NOT NULL,
  "windowEndsAt" TIMESTAMP(3),
  "actionType" "engagement_rule_action" NOT NULL,
  "actionPayload" JSONB NOT NULL DEFAULT '{}',
  "mode" "engagement_rule_mode" NOT NULL DEFAULT 'APPROVAL',
  "state" "engagement_rule_state" NOT NULL DEFAULT 'ARMED',
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "triggeredAt" TIMESTAMP(3),
  "metricSnapshot" JSONB,
  "resultingReleaseId" TEXT,
  "lastError" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "engagement_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "engagement_rules_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "engagement_rules_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "engagement_rules_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "brands"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "engagement_rules_postGroupId_fkey"
    FOREIGN KEY ("postGroupId") REFERENCES "post_groups"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "engagement_rules_organizationId_isDeleted_state_isEnabled_idx"
  ON "engagement_rules"("organizationId", "isDeleted", "state", "isEnabled");
CREATE INDEX "engagement_rules_organizationId_postGroupId_isDeleted_idx"
  ON "engagement_rules"("organizationId", "postGroupId", "isDeleted");
CREATE INDEX "engagement_rules_targetId_isDeleted_state_idx"
  ON "engagement_rules"("targetId", "isDeleted", "state");

CREATE TABLE "agent_publish_audits" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT,
  "postGroupId" TEXT,
  "agentRunId" TEXT,
  "agentThreadId" TEXT,
  "agentStrategyId" TEXT,
  "autonomyMode" TEXT NOT NULL,
  "channel" TEXT,
  "policyName" TEXT NOT NULL,
  "decision" "agent_publish_decision" NOT NULL,
  "reason" TEXT NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_publish_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_publish_audits_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "agent_publish_audits_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "agent_publish_audits_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "brands"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "agent_publish_audits_postGroupId_fkey"
    FOREIGN KEY ("postGroupId") REFERENCES "post_groups"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "agent_publish_audits_organizationId_isDeleted_createdAt_idx"
  ON "agent_publish_audits"("organizationId", "isDeleted", "createdAt" DESC);
CREATE INDEX "agent_publish_audits_postGroupId_isDeleted_createdAt_idx"
  ON "agent_publish_audits"("postGroupId", "isDeleted", "createdAt" DESC);
CREATE INDEX "agent_publish_audits_agentRunId_isDeleted_idx"
  ON "agent_publish_audits"("agentRunId", "isDeleted");

ALTER TABLE "post_groups"
  ADD CONSTRAINT "post_groups_postingSetId_fkey"
    FOREIGN KEY ("postingSetId") REFERENCES "posting_sets"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "post_groups_rssSourceId_fkey"
    FOREIGN KEY ("rssSourceId") REFERENCES "rss_sources"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
