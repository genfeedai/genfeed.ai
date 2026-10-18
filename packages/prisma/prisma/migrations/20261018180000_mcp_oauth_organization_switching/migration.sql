-- MCP OAuth: let a consent grant switch organizations.
--
-- A user who belongs to several organizations can tick one box at consent so a
-- single MCP connection moves between them. The flag rides the one-time
-- authorization code onto the session key. Additive with a false default:
-- every existing code and connection keeps one fixed organization.
ALTER TABLE "mcp_oauth_auth_codes"
  ADD COLUMN "canSwitchOrganizations" BOOLEAN NOT NULL DEFAULT false;
