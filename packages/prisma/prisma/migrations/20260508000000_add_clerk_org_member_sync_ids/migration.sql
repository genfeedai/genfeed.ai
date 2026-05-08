ALTER TABLE "organizations" ADD COLUMN "clerkOrganizationId" TEXT;

ALTER TABLE "members" ADD COLUMN "clerkMembershipId" TEXT;

CREATE UNIQUE INDEX "organizations_clerkOrganizationId_key" ON "organizations"("clerkOrganizationId");

CREATE UNIQUE INDEX "members_clerkMembershipId_key" ON "members"("clerkMembershipId");
