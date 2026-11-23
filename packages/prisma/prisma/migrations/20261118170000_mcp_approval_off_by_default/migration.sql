-- "Require approval for MCP requests" is off by default, and off for every existing
-- organization and member (decision 2026-11-18, #10592).
--
-- Both columns were created with DEFAULT true, so a row that holds true cannot be told
-- apart from one an owner turned on by choice. All of them are set to false; an
-- organization that wants a human check on credit spend turns the switch back on in
-- Settings. Publishing, scheduling and other outbound actions are unaffected: they always
-- wait for approval regardless of these columns.

ALTER TABLE "organization_settings"
  ALTER COLUMN "isMcpApprovalRequired" SET DEFAULT false;

ALTER TABLE "settings"
  ALTER COLUMN "isMcpApprovalRequired" SET DEFAULT false;

UPDATE "organization_settings"
  SET "isMcpApprovalRequired" = false
  WHERE "isMcpApprovalRequired" = true;

UPDATE "settings"
  SET "isMcpApprovalRequired" = false
  WHERE "isMcpApprovalRequired" = true;
