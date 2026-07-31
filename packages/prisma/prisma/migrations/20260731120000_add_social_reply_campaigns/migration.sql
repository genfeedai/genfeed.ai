-- Throttled reply campaigns over the social inbox (#1010).
--
-- Recipients are materialized up front and drained one at a time by a
-- self-rescheduling BullMQ job. Both tables are org-scoped and soft-deleted
-- (`isDeleted`), consistent with the rest of the social inbox.

-- CreateTable
CREATE TABLE "social_reply_campaigns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "platform" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'reply',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "bodyTemplate" TEXT NOT NULL,
    "maxPerHour" INTEGER NOT NULL DEFAULT 10,
    "maxPerDay" INTEGER NOT NULL DEFAULT 50,
    "minDelaySeconds" INTEGER NOT NULL DEFAULT 60,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "dispatchCursor" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "lastDispatchedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "workflowId" TEXT,
    "workflowExecutionId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_reply_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_reply_campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "position" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "body" TEXT,
    "failureReason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_reply_campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_reply_campaigns_org_status_idx" ON "social_reply_campaigns"("organizationId", "isDeleted", "status", "createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "social_reply_campaigns_org_brand_idx" ON "social_reply_campaigns"("organizationId", "brandId", "isDeleted", "createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "social_reply_campaigns_due_idx" ON "social_reply_campaigns"("status", "isDeleted", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "social_reply_campaign_recipients_campaignId_conversationId_key" ON "social_reply_campaign_recipients"("campaignId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "social_reply_campaign_recipients_organizationId_idempotencyKey_key" ON "social_reply_campaign_recipients"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "social_reply_campaign_recipients_queue_idx" ON "social_reply_campaign_recipients"("campaignId", "status", "position", "id");

-- CreateIndex
CREATE INDEX "social_reply_campaign_recipients_window_idx" ON "social_reply_campaign_recipients"("organizationId", "campaignId", "status", "sentAt" DESC);

-- AddForeignKey
ALTER TABLE "social_reply_campaign_recipients" ADD CONSTRAINT "social_reply_campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "social_reply_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
