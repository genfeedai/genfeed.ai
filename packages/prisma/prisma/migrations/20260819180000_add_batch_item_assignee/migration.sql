-- Nullable canonical-user assignment on review queue items (#3200).
-- FK is users.id only — never an auth-provider id.

ALTER TABLE "batch_items" ADD COLUMN "assigneeId" TEXT;

CREATE INDEX "batch_items_org_assignee_deleted_idx"
ON "batch_items"("organizationId", "assigneeId", "isDeleted");

ALTER TABLE "batch_items"
ADD CONSTRAINT "batch_items_assigneeId_fkey"
FOREIGN KEY ("assigneeId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
