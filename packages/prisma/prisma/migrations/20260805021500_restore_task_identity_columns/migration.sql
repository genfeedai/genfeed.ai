BEGIN;

ALTER TABLE "tasks"
ADD COLUMN "identifier" TEXT,
ADD COLUMN "taskNumber" INTEGER;

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_organizationId_identifier_key"
UNIQUE ("organizationId", "identifier");

COMMIT;
