-- Rename the four paid provider reads to `fetch_*`, as a hard cut: a `get_*`
-- tool reads our own data or a free provider call, a `fetch_*` tool bills a
-- third party per call. No alias under the old names.
--
-- Like 20261030130000_rename_list_tools_to_get, this rewrites only the stored
-- reference the application reads back: an MCP approval still waiting for a
-- decision names its tool. workflow_versions (hashed graphs) is never
-- rewritten, and agent_messages / agent_untrusted_content_audits keep the tool
-- names they recorded. System workflows (`agent.tool.<name>`) are registered
-- in code by canonical id, so drain in-flight runs of the old ids before
-- deploying.

UPDATE "mcp_approvals"
SET "toolName" = CASE "toolName"
  WHEN 'get_instagram_inspiration' THEN 'fetch_instagram_inspiration'
  WHEN 'get_instagram_inspiration_detail' THEN 'fetch_instagram_inspiration_detail'
  WHEN 'get_x_account_activity' THEN 'fetch_x_account_activity'
  WHEN 'get_x_posts' THEN 'fetch_x_posts'
END
WHERE "toolName" IN (
  'get_instagram_inspiration',
  'get_instagram_inspiration_detail',
  'get_x_account_activity',
  'get_x_posts'
);
