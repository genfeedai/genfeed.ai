-- Match Prisma JSON path equality and the latest-execution ordering.
CREATE INDEX "workflow_executions_agent_thread_lookup_idx"
ON "workflow_executions" (
  "organizationId", "isDeleted",
  ("result" #> '{metadata,threadId}'::text[]),
  "createdAt" DESC, "id" DESC
);
