-- Durable social inbox conversations and messages (#1010).
-- Stores normalized comments, replies, DMs, and workflow/agent provenance for
-- the protected /messages operator surface.

CREATE TABLE "social_conversations" (
  "id" TEXT NOT NULL,
  "mongoId" TEXT,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT,
  "brandId" TEXT,
  "credentialId" TEXT,
  "postId" TEXT,
  "platform" TEXT NOT NULL,
  "conversationType" TEXT NOT NULL DEFAULT 'comment',
  "externalConversationId" TEXT,
  "externalThreadId" TEXT,
  "externalParentId" TEXT,
  "sourceContentId" TEXT,
  "sourceContentUrl" TEXT,
  "sourceContentTitle" TEXT,
  "sourceContentType" TEXT,
  "accountExternalId" TEXT,
  "accountHandle" TEXT,
  "accountName" TEXT,
  "participantExternalId" TEXT,
  "participantHandle" TEXT,
  "participantName" TEXT,
  "participantAvatarUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "needsReview" BOOLEAN NOT NULL DEFAULT false,
  "automationState" TEXT NOT NULL DEFAULT 'manual',
  "assignedOwnerId" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "latestMessageText" TEXT,
  "latestMessageAt" TIMESTAMP(3),
  "lastInboundAt" TIMESTAMP(3),
  "lastOutboundAt" TIMESTAMP(3),
  "availability" JSONB NOT NULL DEFAULT '{}',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "social_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "social_messages" (
  "id" TEXT NOT NULL,
  "mongoId" TEXT,
  "conversationId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT,
  "brandId" TEXT,
  "credentialId" TEXT,
  "postId" TEXT,
  "platform" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "messageType" TEXT NOT NULL DEFAULT 'comment',
  "body" TEXT NOT NULL,
  "externalMessageId" TEXT,
  "externalParentMessageId" TEXT,
  "senderExternalId" TEXT,
  "senderHandle" TEXT,
  "senderName" TEXT,
  "senderAvatarUrl" TEXT,
  "authorRole" TEXT,
  "status" TEXT NOT NULL DEFAULT 'received',
  "sourceUrl" TEXT,
  "idempotencyKey" TEXT,
  "workflowRunId" TEXT,
  "agentRunId" TEXT,
  "actionProvenance" JSONB NOT NULL DEFAULT '{}',
  "failureReason" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "social_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "social_conversations_mongoId_key" ON "social_conversations"("mongoId");
CREATE UNIQUE INDEX "social_conversations_organizationId_platform_externalConversationId_key" ON "social_conversations"("organizationId", "platform", "externalConversationId");
CREATE INDEX "social_conversations_inbox_idx" ON "social_conversations"("organizationId", "brandId", "status", "isDeleted", "latestMessageAt" DESC, "id");
CREATE INDEX "social_conversations_platform_idx" ON "social_conversations"("organizationId", "platform", "isDeleted", "latestMessageAt" DESC, "id");
CREATE INDEX "social_conversations_credential_idx" ON "social_conversations"("credentialId", "isDeleted", "latestMessageAt" DESC);
CREATE INDEX "social_conversations_post_idx" ON "social_conversations"("postId", "isDeleted", "latestMessageAt" DESC);

CREATE UNIQUE INDEX "social_messages_mongoId_key" ON "social_messages"("mongoId");
CREATE UNIQUE INDEX "social_messages_organizationId_platform_externalMessageId_key" ON "social_messages"("organizationId", "platform", "externalMessageId");
CREATE UNIQUE INDEX "social_messages_organizationId_idempotencyKey_key" ON "social_messages"("organizationId", "idempotencyKey");
CREATE INDEX "social_messages_conversation_desc_idx" ON "social_messages"("organizationId", "conversationId", "isDeleted", "createdAt" DESC, "id");
CREATE INDEX "social_messages_conversation_asc_idx" ON "social_messages"("conversationId", "isDeleted", "createdAt", "id");
CREATE INDEX "social_messages_org_brand_direction_idx" ON "social_messages"("organizationId", "brandId", "direction", "isDeleted", "createdAt" DESC);

ALTER TABLE "social_conversations" ADD CONSTRAINT "social_conversations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_conversations" ADD CONSTRAINT "social_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "social_conversations" ADD CONSTRAINT "social_conversations_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "social_conversations" ADD CONSTRAINT "social_conversations_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "social_conversations" ADD CONSTRAINT "social_conversations_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "social_messages" ADD CONSTRAINT "social_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "social_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_messages" ADD CONSTRAINT "social_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_messages" ADD CONSTRAINT "social_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "social_messages" ADD CONSTRAINT "social_messages_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "social_messages" ADD CONSTRAINT "social_messages_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "social_messages" ADD CONSTRAINT "social_messages_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
