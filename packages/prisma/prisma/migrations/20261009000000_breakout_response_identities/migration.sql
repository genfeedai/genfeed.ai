CREATE UNIQUE INDEX "breakout_baseline_receipts_response_scope_key" ON "breakout_baseline_receipts"("id", "organizationId", "brandId", "credentialId");

CREATE TABLE "breakout_responses" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "logicalPostId" TEXT NOT NULL,
  "sourcePostId" TEXT NOT NULL,
  "triggerReceiptId" TEXT NOT NULL,
  "publicationFingerprint" TEXT NOT NULL,
  "contentDigest" TEXT NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'detected',
  "heldReason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "outputPlanFingerprint" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "breakout_responses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "breakout_responses_source_post_scope_fkey" FOREIGN KEY ("sourcePostId", "organizationId", "brandId") REFERENCES "posts"("id", "organizationId", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "breakout_responses_trigger_scope_fkey" FOREIGN KEY ("triggerReceiptId", "organizationId", "brandId", "credentialId") REFERENCES "breakout_baseline_receipts"("id", "organizationId", "brandId", "credentialId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "breakout_responses_output_scope_key" ON "breakout_responses"("id", "organizationId", "brandId", "credentialId");
CREATE UNIQUE INDEX "breakout_responses_source_key" ON "breakout_responses"("organizationId", "credentialId", "platform", "externalId");
CREATE INDEX "breakout_responses_scope_idx" ON "breakout_responses"("organizationId", "brandId", "credentialId", "isDeleted", "state", "detectedAt" DESC);

CREATE TABLE "breakout_response_outputs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "responseId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "generationKey" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'reserved',
  "heldReason" TEXT,
  "workflowExecutionId" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "breakout_response_outputs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "breakout_response_outputs_response_scope_fkey" FOREIGN KEY ("responseId", "organizationId", "brandId", "credentialId") REFERENCES "breakout_responses"("id", "organizationId", "brandId", "credentialId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "breakout_response_outputs_slot_check" CHECK ("ordinal" BETWEEN 1 AND 5 AND "kind" IN ('follow_up', 'quote') AND ("kind" <> 'quote' OR ("ordinal" = 1 AND "format" = 'text'))),
  CONSTRAINT "breakout_response_outputs_format_check" CHECK ("format" IN ('text', 'image', 'carousel', 'video', 'short', 'thread'))
);
CREATE UNIQUE INDEX "breakout_response_outputs_post_scope_key" ON "breakout_response_outputs"("id", "organizationId", "brandId");
CREATE UNIQUE INDEX "breakout_response_outputs_slot_key" ON "breakout_response_outputs"("organizationId", "responseId", "ordinal");
CREATE UNIQUE INDEX "breakout_response_outputs_generation_key" ON "breakout_response_outputs"("organizationId", "generationKey");
CREATE INDEX "breakout_response_outputs_scope_idx" ON "breakout_response_outputs"("organizationId", "brandId", "credentialId", "isDeleted", "state");

ALTER TABLE "posts" ADD COLUMN "breakoutOutputId" TEXT;
CREATE UNIQUE INDEX "posts_breakoutOutputId_key" ON "posts"("breakoutOutputId");
CREATE UNIQUE INDEX "posts_breakout_output_scope_key" ON "posts"("breakoutOutputId", "organizationId", "brandId");
ALTER TABLE "posts" ADD CONSTRAINT "posts_breakout_output_scope_fkey" FOREIGN KEY ("breakoutOutputId", "organizationId", "brandId") REFERENCES "breakout_response_outputs"("id", "organizationId", "brandId") ON DELETE RESTRICT ON UPDATE CASCADE;
