-- Rename the 31 `list_*` MCP tools to `get_*`, as a hard cut: one verb prefix for
-- every read tool, no alias under the old names.
--
-- This migration rewrites only the stored reference the application reads back:
-- an MCP approval still waiting for a decision names its tool. No table or
-- column is renamed or dropped.
--
-- Integrity-protected history (workflow_versions, whose graphs are hashed) is
-- never rewritten, and agent_messages / agent_untrusted_content_audits keep the
-- tool names they recorded. System workflows (`agent.tool.<name>`) are
-- registered in code by canonical id, so drain in-flight runs of the old ids
-- before deploying.

UPDATE "mcp_approvals"
SET "toolName" = CASE "toolName"
  WHEN 'list_activity' THEN 'get_activity'
  WHEN 'list_ads_research' THEN 'get_ads_research'
  WHEN 'list_agent_conversations' THEN 'get_agent_conversations'
  WHEN 'list_assets' THEN 'get_assets'
  WHEN 'list_brand_publishing_readiness' THEN 'get_brand_publishing_readiness'
  WHEN 'list_clipper_projects' THEN 'get_clipper_projects'
  WHEN 'list_editor_projects' THEN 'get_editor_projects'
  WHEN 'list_genfeed_tools' THEN 'get_genfeed_tools'
  WHEN 'list_google_ads_campaigns' THEN 'get_google_ads_campaigns'
  WHEN 'list_google_ads_customers' THEN 'get_google_ads_customers'
  WHEN 'list_inbox' THEN 'get_inbox'
  WHEN 'list_instagram_inspiration' THEN 'get_instagram_inspiration'
  WHEN 'list_knowledge_sources' THEN 'get_knowledge_sources'
  WHEN 'list_meta_ad_accounts' THEN 'get_meta_ad_accounts'
  WHEN 'list_meta_ad_creatives' THEN 'get_meta_ad_creatives'
  WHEN 'list_meta_campaigns' THEN 'get_meta_campaigns'
  WHEN 'list_orgs' THEN 'get_orgs'
  WHEN 'list_outlier_posts' THEN 'get_outlier_posts'
  WHEN 'list_review_queue' THEN 'get_review_queue'
  WHEN 'list_social_conversations' THEN 'get_social_conversations'
  WHEN 'list_stalled_items' THEN 'get_stalled_items'
  WHEN 'list_system_workflow_catalog' THEN 'get_system_workflow_catalog'
  WHEN 'list_tasks' THEN 'get_tasks'
  WHEN 'list_tiktok_ad_accounts' THEN 'get_tiktok_ad_accounts'
  WHEN 'list_tiktok_adgroups' THEN 'get_tiktok_adgroups'
  WHEN 'list_tiktok_ads' THEN 'get_tiktok_ads'
  WHEN 'list_tiktok_campaigns' THEN 'get_tiktok_campaigns'
  WHEN 'list_workflow_runs' THEN 'get_workflow_runs'
  WHEN 'list_workflow_templates' THEN 'get_workflow_templates'
  WHEN 'list_workflows' THEN 'get_workflows'
  WHEN 'list_x_account_activity' THEN 'get_x_account_activity'
  ELSE "toolName"
END
WHERE "toolName" IN (
  'list_activity',
  'list_ads_research',
  'list_agent_conversations',
  'list_assets',
  'list_brand_publishing_readiness',
  'list_clipper_projects',
  'list_editor_projects',
  'list_genfeed_tools',
  'list_google_ads_campaigns',
  'list_google_ads_customers',
  'list_inbox',
  'list_instagram_inspiration',
  'list_knowledge_sources',
  'list_meta_ad_accounts',
  'list_meta_ad_creatives',
  'list_meta_campaigns',
  'list_orgs',
  'list_outlier_posts',
  'list_review_queue',
  'list_social_conversations',
  'list_stalled_items',
  'list_system_workflow_catalog',
  'list_tasks',
  'list_tiktok_ad_accounts',
  'list_tiktok_adgroups',
  'list_tiktok_ads',
  'list_tiktok_campaigns',
  'list_workflow_runs',
  'list_workflow_templates',
  'list_workflows',
  'list_x_account_activity'
);
