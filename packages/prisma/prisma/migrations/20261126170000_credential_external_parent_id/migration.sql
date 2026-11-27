-- Google Ads: a client account reached through a manager account needs the
-- manager's id as the login-customer-id header on every read. NULL means the
-- account is opened directly (every row that exists today).
ALTER TABLE "credentials"
  ADD COLUMN "externalParentId" TEXT;
