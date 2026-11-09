-- Newsletter module (#9722, #9665): brand subscribers with double opt-in,
-- CSV imports with recorded consent, per-brand sending settings, one-time
-- sends with per-recipient receipts, and first-party link clicks. Newsletter
-- issues gain an access level and unlock price for paid issues (#9718).


-- AlterTable
ALTER TABLE "newsletters" ADD COLUMN     "accessLevel" TEXT NOT NULL DEFAULT 'public',
ADD COLUMN     "unlockPriceCredits" INTEGER;

-- CreateTable
CREATE TABLE "brand_subscribers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "name" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceRef" TEXT,
    "consentMethod" TEXT,
    "consentAt" TIMESTAMP(3),
    "consentIp" TEXT,
    "importId" TEXT,
    "confirmTokenHash" TEXT,
    "confirmSentAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_subscriber_imports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT,
    "consentConfirmedAt" TIMESTAMP(3) NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "addedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "invalidCount" INTEGER NOT NULL DEFAULT 0,
    "suppressedCount" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_subscriber_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "senderName" TEXT,
    "replyTo" TEXT,
    "postalAddress" TEXT,
    "footerText" TEXT,
    "isWelcomeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "welcomeSubject" TEXT,
    "welcomeBody" TEXT,
    "isAttributionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "paidPriceCredits" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_sends" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "newsletterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "previewHtml" TEXT,
    "previewText" TEXT,
    "links" JSONB NOT NULL DEFAULT '[]',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_sends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_send_recipients" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sendId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "recipientHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_send_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_link_clicks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sendId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "linkIndex" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "newsletter_link_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brand_subscribers_confirmTokenHash_key" ON "brand_subscribers"("confirmTokenHash");

-- CreateIndex
CREATE INDEX "brand_subscribers_organizationId_brandId_isDeleted_status_idx" ON "brand_subscribers"("organizationId", "brandId", "isDeleted", "status");

-- CreateIndex
CREATE INDEX "brand_subscribers_organizationId_brandId_isDeleted_createdA_idx" ON "brand_subscribers"("organizationId", "brandId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "brand_subscribers_brandId_emailHash_key" ON "brand_subscribers"("brandId", "emailHash");

-- CreateIndex
CREATE INDEX "brand_subscriber_imports_organizationId_brandId_isDeleted_c_idx" ON "brand_subscriber_imports"("organizationId", "brandId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_settings_brandId_key" ON "newsletter_settings"("brandId");

-- CreateIndex
CREATE INDEX "newsletter_settings_organizationId_isDeleted_idx" ON "newsletter_settings"("organizationId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_sends_idempotencyKey_key" ON "newsletter_sends"("idempotencyKey");

-- CreateIndex
CREATE INDEX "newsletter_sends_status_scheduledFor_idx" ON "newsletter_sends"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "newsletter_sends_organizationId_brandId_isDeleted_createdAt_idx" ON "newsletter_sends"("organizationId", "brandId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "newsletter_sends_organizationId_newsletterId_isDeleted_idx" ON "newsletter_sends"("organizationId", "newsletterId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_send_recipients_providerMessageId_key" ON "newsletter_send_recipients"("providerMessageId");

-- CreateIndex
CREATE INDEX "newsletter_send_recipients_sendId_status_nextAttemptAt_idx" ON "newsletter_send_recipients"("sendId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "newsletter_send_recipients_organizationId_subscriberId_isDe_idx" ON "newsletter_send_recipients"("organizationId", "subscriberId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_send_recipients_sendId_subscriberId_key" ON "newsletter_send_recipients"("sendId", "subscriberId");

-- CreateIndex
CREATE INDEX "newsletter_link_clicks_organizationId_sendId_isDeleted_link_idx" ON "newsletter_link_clicks"("organizationId", "sendId", "isDeleted", "linkIndex");

-- CreateIndex
CREATE INDEX "newsletter_link_clicks_recipientId_idx" ON "newsletter_link_clicks"("recipientId");

-- AddForeignKey
ALTER TABLE "brand_subscribers" ADD CONSTRAINT "brand_subscribers_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_settings" ADD CONSTRAINT "newsletter_settings_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_sends" ADD CONSTRAINT "newsletter_sends_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_sends" ADD CONSTRAINT "newsletter_sends_newsletterId_fkey" FOREIGN KEY ("newsletterId") REFERENCES "newsletters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_send_recipients" ADD CONSTRAINT "newsletter_send_recipients_sendId_fkey" FOREIGN KEY ("sendId") REFERENCES "newsletter_sends"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_send_recipients" ADD CONSTRAINT "newsletter_send_recipients_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "brand_subscribers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

