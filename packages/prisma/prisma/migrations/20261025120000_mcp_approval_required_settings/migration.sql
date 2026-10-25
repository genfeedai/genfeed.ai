-- "Require approval for MCP requests": an organization policy and a per-member
-- preference. Both default to true, so every existing organization and member keeps
-- today's behavior. An MCP generation skips the approvals queue only when both are false.
ALTER TABLE "organization_settings"
  ADD COLUMN "isMcpApprovalRequired" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "settings"
  ADD COLUMN "isMcpApprovalRequired" BOOLEAN NOT NULL DEFAULT true;
