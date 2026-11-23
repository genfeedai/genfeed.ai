-- One row per event a workflow's "run content agent" step receives (#10897).
--
-- The unique key makes a replayed event start nothing. The rows of the last 24
-- hours are the agent's cap on event-started runs. A claim that never reached
-- STARTED is retaken once its lease runs out.

-- CreateEnum
CREATE TYPE "AgentEventRunStatus" AS ENUM ('CLAIMED', 'STARTED', 'FAILED');

-- CreateTable
CREATE TABLE "agent_event_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "status" "AgentEventRunStatus" NOT NULL DEFAULT 'CLAIMED',
    "workflowId" TEXT,
    "workflowExecutionId" TEXT,
    "agentExecutionId" TEXT,
    "threadId" TEXT,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_event_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_event_runs_org_strategy_event_key" ON "agent_event_runs"("organizationId", "strategyId", "eventKey");

-- CreateIndex
CREATE INDEX "agent_event_runs_org_strategy_created_idx" ON "agent_event_runs"("organizationId", "strategyId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "agent_event_runs" ADD CONSTRAINT "agent_event_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_event_runs" ADD CONSTRAINT "agent_event_runs_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "agent_strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
