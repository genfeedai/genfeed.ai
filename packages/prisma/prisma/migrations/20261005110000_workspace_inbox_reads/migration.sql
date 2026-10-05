CREATE TABLE "workspace_inbox_reads" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "taskId" TEXT NOT NULL REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "seenUpdatedAt" TIMESTAMP(3) NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "workspace_inbox_reads_organizationId_userId_taskId_key" ON "workspace_inbox_reads"("organizationId", "userId", "taskId");
CREATE INDEX "workspace_inbox_reads_organizationId_userId_isDeleted_idx" ON "workspace_inbox_reads"("organizationId", "userId", "isDeleted");
