ALTER TABLE "agent_threads" ADD COLUMN "agentStrategyId" TEXT;
CREATE UNIQUE INDEX "agent_threads_agentStrategyId_key" ON "agent_threads"("agentStrategyId");
ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_agentStrategyId_fkey" FOREIGN KEY ("agentStrategyId") REFERENCES "agent_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
