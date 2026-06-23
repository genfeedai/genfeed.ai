ALTER TABLE "organizations" ADD COLUMN "authProviderOrganizationId" TEXT;

ALTER TABLE "members" ADD COLUMN "authProviderMembershipId" TEXT;

CREATE UNIQUE INDEX "organizations_authProviderOrganizationId_key" ON "organizations"("authProviderOrganizationId");

CREATE UNIQUE INDEX "members_authProviderMembershipId_key" ON "members"("authProviderMembershipId");
