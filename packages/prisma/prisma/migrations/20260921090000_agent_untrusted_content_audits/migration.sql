-- CreateTable
CREATE TABLE "agent_untrusted_content_audits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "workflowExecutionId" TEXT,
    "agentThreadId" TEXT,
    "agentStrategyId" TEXT,
    "toolName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "minConfidence" DOUBLE PRECISION NOT NULL,
    "mode" TEXT NOT NULL,
    "contentLength" INTEGER NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_untrusted_content_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_untrusted_content_audits_organizationId_isDeleted_crea_idx" ON "agent_untrusted_content_audits"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "agent_untrusted_content_audits_organizationId_outcome_isDele_idx" ON "agent_untrusted_content_audits"("organizationId", "outcome", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "agent_untrusted_content_audits_workflowExecutionId_isDeleted_idx" ON "agent_untrusted_content_audits"("workflowExecutionId", "isDeleted");

-- AddForeignKey
ALTER TABLE "agent_untrusted_content_audits" ADD CONSTRAINT "agent_untrusted_content_audits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_untrusted_content_audits" ADD CONSTRAINT "agent_untrusted_content_audits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_untrusted_content_audits" ADD CONSTRAINT "agent_untrusted_content_audits_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_untrusted_content_audits" ADD CONSTRAINT "agent_untrusted_content_audits_workflowExecutionId_fkey" FOREIGN KEY ("workflowExecutionId") REFERENCES "workflow_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
