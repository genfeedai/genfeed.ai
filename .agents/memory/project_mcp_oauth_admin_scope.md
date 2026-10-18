---
name: mcp_oauth_admin_scope
description: Hosted MCP OAuth sessions carry the explicit `admin` scope for org owners/admins, because API keys are otherwise capped to the user role
type: project
status: active
last_verified: 2026-10-15
topics: [mcp, oauth, api-keys, authorization, brands]
---

**Rule:** `OAuthAuthorizeService.decideAuthorization` appends `ApiKeyScope.ADMIN`
to the minted `gf_` session key only when all of these hold: the user picked an
organization where their membership role is `owner` or `admin`, the grant is the
full `API_KEY_SCOPE_PRESETS.mcp` set, and the resource is the standard MCP
endpoint (never the Claude connector). Membership is still re-read on every
request, so demoting the member removes the elevation.

**Why:** #4358 made every API key resolve to the `user` role unless it holds an
explicit `admin` scope. OAuth keys never did, so an org owner connecting an MCP
client saw `Role: User`, an empty `get_brands` (non-privileged callers only see
brands assigned to their member row), a denied `onboard_brand create_from_url`,
and therefore no `brandId` for `generate`.

**How to apply:** do not "fix" an owner seeing `Role: User` by widening the API-key
role cap or by reading the membership role in the MCP server; grant the scope at
consent. Existing tokens keep the old scopes until the client reconnects. The MCP
e2e suite (`apps/server/mcp/test/e2e`) pins the journey. Org switching is
opt-in: with the consent checkbox ticked (2+ orgs, not the Claude connector) the
session key stores `canSwitchOrganizations`, `switch_org` records the chosen org in
`activeOrganizationId`, and the API key guard honours it only while the user's
membership there is live. The key row itself never changes org.
