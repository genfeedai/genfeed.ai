ALTER TABLE "ingredients"
ADD COLUMN "sourceActionId" TEXT;

CREATE INDEX "ingredients_org_source_action_idx"
ON "ingredients"("organizationId", "sourceActionId");
