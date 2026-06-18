-- Add indexes for bounded agent and desktop list/sync hot paths.

-- CreateIndex
CREATE INDEX "agent_messages_organizationId_threadId_isDeleted_createdAt_id_idx" ON "agent_messages"("organizationId", "threadId", "isDeleted", "createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "agent_messages_threadId_isDeleted_id_idx" ON "agent_messages"("threadId", "isDeleted", "id");

-- CreateIndex
CREATE INDEX "agent_runs_organizationId_isDeleted_createdAt_idx" ON "agent_runs"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "agent_runs_organizationId_isDeleted_status_createdAt_idx" ON "agent_runs"("organizationId", "isDeleted", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "agent_runs_organizationId_threadId_isDeleted_createdAt_idx" ON "agent_runs"("organizationId", "threadId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "desktop_threads_organization_id_user_id_updatedAt_idx" ON "desktop_threads"("organization_id", "user_id", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "desktop_messages_threadId_createdAt_id_idx" ON "desktop_messages"("threadId", "createdAt", "id");
