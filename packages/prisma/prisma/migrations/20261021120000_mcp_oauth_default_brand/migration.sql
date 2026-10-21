-- MCP OAuth: carry the brand chosen at consent onto the session key.
--
-- The consent screen lets the user pick one brand (or none, for organization
-- wide reads). It rides the one-time authorization code and becomes the
-- session key's defaultBrandId, so generation tools have a brand without the
-- client having to pass one. Additive and nullable: every existing code and
-- connection keeps working with no default brand.
ALTER TABLE "mcp_oauth_auth_codes"
  ADD COLUMN "defaultBrandId" TEXT;
