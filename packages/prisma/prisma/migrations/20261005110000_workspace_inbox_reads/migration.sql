CREATE UNIQUE INDEX "tasks_id_organizationId_key" ON "tasks"("id", "organizationId");
CREATE TABLE "workspace_inbox_reads" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "taskId" TEXT NOT NULL,
  FOREIGN KEY ("taskId", "organizationId") REFERENCES "tasks"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "seenUpdatedAt" TIMESTAMP(3) NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "workspace_inbox_reads_organizationId_userId_taskId_key" ON "workspace_inbox_reads"("organizationId", "userId", "taskId");
CREATE INDEX "workspace_inbox_reads_organizationId_userId_isDeleted_idx" ON "workspace_inbox_reads"("organizationId", "userId", "isDeleted");


-- Preserve the prior inbox boundary for historical tasks that no longer need
-- attention. New tasks and subsequent updates still become unread.
INSERT INTO "workspace_inbox_reads" ("id", "organizationId", "userId", "taskId", "seenUpdatedAt", "updatedAt")
SELECT gen_random_uuid()::text, t."organizationId", m."userId", t."id", t."updatedAt", CURRENT_TIMESTAMP
FROM "tasks" t
JOIN "members" m ON m."organizationId" = t."organizationId" AND NOT m."isDeleted" AND m."isActive"
JOIN "users" u ON u."id" = m."userId" AND NOT u."isDeleted"
JOIN "organizations" o ON o."id" = t."organizationId" AND NOT o."isDeleted"
WHERE NOT t."isDeleted" AND t."dismissedAt" IS NULL AND t."reviewState" <> 'dismissed'
  AND NOT (t."reviewState" IN ('pending_approval', 'changes_requested')
    OR t."status" IN ('backlog', 'in_progress', 'in_review', 'failed'))
ON CONFLICT ("organizationId", "userId", "taskId") DO NOTHING;
