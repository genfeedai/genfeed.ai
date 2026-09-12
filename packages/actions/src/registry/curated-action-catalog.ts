import type { ToolsetName } from './toolset-names';

export type CuratedActionSurface = 'agent' | 'mcp';

export interface CuratedActionCatalogEntry {
  isPublishingApprovalRequired?: true;
  name: string;
  surfaces: readonly [CuratedActionSurface, ...CuratedActionSurface[]];
  toolset: ToolsetName;
}

/**
 * Reviewed product-action inventory for the in-app Agent and MCP server.
 *
 * This is the only source of truth for surface intent. Tool definition shards
 * provide schemas and metadata, while this catalog decides whether an action
 * is available on Agent, MCP, or both. Keep entries sorted by action name so
 * additions, removals, and surface transitions remain obvious in review.
 */
export const CURATED_ACTION_CATALOG = [
  { name: 'ai_action', surfaces: ['agent'], toolset: 'content' },
  { name: 'analyze_clip_project', surfaces: ['mcp'], toolset: 'clips' },
  {
    name: 'analyze_performance',
    surfaces: ['agent', 'mcp'],
    toolset: 'analytics',
  },
  {
    isPublishingApprovalRequired: true,
    name: 'approve_social_draft',
    surfaces: ['mcp'],
    toolset: 'social-inbox',
  },
  {
    name: 'archive_knowledge_source',
    surfaces: ['agent', 'mcp'],
    toolset: 'knowledge',
  },
  {
    name: 'assign_knowledge_purpose',
    surfaces: ['agent', 'mcp'],
    toolset: 'knowledge',
  },
  {
    name: 'assign_social_conversation',
    surfaces: ['mcp'],
    toolset: 'social-inbox',
  },
  { name: 'batch_approve_reject', surfaces: ['agent'], toolset: 'content' },
  {
    name: 'capture_knowledge',
    surfaces: ['agent', 'mcp'],
    toolset: 'knowledge',
  },
  { name: 'capture_memory', surfaces: ['agent'], toolset: 'memory' },
  { name: 'check_goal_progress', surfaces: ['agent'], toolset: 'goals' },
  {
    name: 'check_onboarding_status',
    surfaces: ['agent'],
    toolset: 'onboarding',
  },
  { name: 'compare_meta_campaigns', surfaces: ['mcp'], toolset: 'ads' },
  { name: 'complete_onboarding', surfaces: ['agent'], toolset: 'onboarding' },
  {
    name: 'complete_outreach_sequence',
    surfaces: ['agent'],
    toolset: 'outreach',
  },
  {
    name: 'connect_social_account',
    surfaces: ['agent'],
    toolset: 'onboarding',
  },
  {
    isPublishingApprovalRequired: true,
    name: 'control_scheduled_release',
    surfaces: ['mcp'],
    toolset: 'scheduler',
  },
  {
    name: 'create_ad_remix_workflow',
    surfaces: ['agent', 'mcp'],
    toolset: 'workflows',
  },
  { name: 'create_article', surfaces: ['mcp'], toolset: 'content' },
  { name: 'create_brand', surfaces: ['agent'], toolset: 'onboarding' },
  { name: 'create_chat', surfaces: ['mcp'], toolset: 'agent-chat' },
  {
    name: 'create_clip_project_from_youtube',
    surfaces: ['mcp'],
    toolset: 'clips',
  },
  { name: 'create_goal', surfaces: ['agent'], toolset: 'goals' },
  {
    name: 'create_instagram_remix_workflow',
    surfaces: ['agent', 'mcp'],
    toolset: 'workflows',
  },
  { name: 'create_livestream_bot', surfaces: ['agent'], toolset: 'engagement' },
  {
    name: 'create_outreach_sequence',
    surfaces: ['agent'],
    toolset: 'outreach',
  },
  {
    isPublishingApprovalRequired: true,
    name: 'create_post',
    surfaces: ['agent', 'mcp'],
    toolset: 'content',
  },
  {
    isPublishingApprovalRequired: true,
    name: 'create_scheduled_release',
    surfaces: ['mcp'],
    toolset: 'scheduler',
  },
  {
    name: 'create_social_reply_draft',
    surfaces: ['mcp'],
    toolset: 'social-inbox',
  },
  { name: 'create_workflow', surfaces: ['agent', 'mcp'], toolset: 'workflows' },
  { name: 'describe_tool', surfaces: ['mcp'], toolset: 'core' },
  { name: 'discover_engagements', surfaces: ['agent'], toolset: 'engagement' },
  { name: 'draft_brand_voice_profile', surfaces: ['agent'], toolset: 'brand' },
  {
    name: 'draft_engagement_reply',
    surfaces: ['agent'],
    toolset: 'engagement',
  },
  { name: 'draft_x_quote', surfaces: ['agent'], toolset: 'content' },
  { name: 'draft_x_repost', surfaces: ['agent'], toolset: 'content' },
  {
    name: 'duplicate_workflow',
    surfaces: ['agent', 'mcp'],
    toolset: 'workflows',
  },
  {
    name: 'execute_workflow',
    surfaces: ['agent', 'mcp'],
    toolset: 'workflows',
  },
  { name: 'fetch_x_post', surfaces: ['agent', 'mcp'], toolset: 'content' },
  { name: 'generate_ad_pack', surfaces: ['agent'], toolset: 'ads' },
  { name: 'generate_as_identity', surfaces: ['agent'], toolset: 'generation' },
  { name: 'generate_clips', surfaces: ['mcp'], toolset: 'clips' },
  { name: 'generate_content', surfaces: ['agent'], toolset: 'content' },
  {
    name: 'generate_content_batch',
    surfaces: ['agent', 'mcp'],
    toolset: 'content',
  },
  { name: 'generate_image', surfaces: ['agent', 'mcp'], toolset: 'generation' },
  { name: 'generate_linkedin_content', surfaces: ['mcp'], toolset: 'content' },
  { name: 'generate_monthly_content', surfaces: ['agent'], toolset: 'content' },
  { name: 'generate_music', surfaces: ['agent', 'mcp'], toolset: 'generation' },
  {
    name: 'generate_onboarding_content',
    surfaces: ['agent'],
    toolset: 'onboarding',
  },
  { name: 'generate_video', surfaces: ['agent', 'mcp'], toolset: 'generation' },
  { name: 'generate_voice', surfaces: ['agent', 'mcp'], toolset: 'generation' },
  { name: 'get_account_info', surfaces: ['mcp'], toolset: 'core' },
  {
    name: 'get_ad_research_detail',
    surfaces: ['agent', 'mcp'],
    toolset: 'ads',
  },
  { name: 'get_ads_ad_insights', surfaces: ['mcp'], toolset: 'ads' },
  { name: 'get_ads_adset_insights', surfaces: ['mcp'], toolset: 'ads' },
  { name: 'get_analytics', surfaces: ['agent', 'mcp'], toolset: 'analytics' },
  { name: 'get_approval_summary', surfaces: ['agent'], toolset: 'engagement' },
  { name: 'get_article', surfaces: ['mcp'], toolset: 'content' },
  { name: 'get_brand', surfaces: ['mcp'], toolset: 'core' },
  {
    name: 'get_brand_completeness',
    surfaces: ['agent', 'mcp'],
    toolset: 'brand',
  },
  { name: 'get_clip_highlights', surfaces: ['mcp'], toolset: 'clips' },
  { name: 'get_clip_project', surfaces: ['mcp'], toolset: 'clips' },
  { name: 'get_connection_status', surfaces: ['agent'], toolset: 'onboarding' },
  { name: 'get_content_analytics', surfaces: ['mcp'], toolset: 'analytics' },
  {
    name: 'get_content_calendar',
    surfaces: ['agent', 'mcp'],
    toolset: 'content',
  },
  { name: 'get_credits_balance', surfaces: ['agent', 'mcp'], toolset: 'core' },
  { name: 'get_current_brand', surfaces: ['agent'], toolset: 'brand' },
  { name: 'get_dashboard_layout', surfaces: ['agent'], toolset: 'ui' },
  {
    name: 'get_google_ads_adgroup_insights',
    surfaces: ['mcp'],
    toolset: 'ads',
  },
  {
    name: 'get_google_ads_campaign_metrics',
    surfaces: ['mcp'],
    toolset: 'ads',
  },
  {
    name: 'get_google_ads_keyword_performance',
    surfaces: ['mcp'],
    toolset: 'ads',
  },
  { name: 'get_google_ads_search_terms', surfaces: ['mcp'], toolset: 'ads' },
  {
    name: 'get_instagram_inspiration_detail',
    surfaces: ['agent', 'mcp'],
    toolset: 'inspiration',
  },
  { name: 'get_job_status', surfaces: ['mcp'], toolset: 'core' },
  { name: 'get_linkedin_analytics', surfaces: ['mcp'], toolset: 'analytics' },
  {
    name: 'get_linkedin_connection_status',
    surfaces: ['mcp'],
    toolset: 'analytics',
  },
  { name: 'get_meta_ad_insights', surfaces: ['mcp'], toolset: 'ads' },
  { name: 'get_meta_adset_insights', surfaces: ['mcp'], toolset: 'ads' },
  { name: 'get_meta_campaign_insights', surfaces: ['mcp'], toolset: 'ads' },
  { name: 'get_meta_top_performers', surfaces: ['mcp'], toolset: 'ads' },
  {
    name: 'get_outreach_sequence_analytics',
    surfaces: ['agent'],
    toolset: 'outreach',
  },
  { name: 'get_scheduled_release', surfaces: ['mcp'], toolset: 'scheduler' },
  { name: 'get_scheduler_capability', surfaces: ['mcp'], toolset: 'scheduler' },
  {
    name: 'get_social_conversation',
    surfaces: ['mcp'],
    toolset: 'social-inbox',
  },
  { name: 'get_tiktok_campaign_insights', surfaces: ['mcp'], toolset: 'ads' },
  {
    name: 'get_tiktok_top_performers',
    surfaces: ['mcp'],
    toolset: 'inspiration',
  },
  { name: 'get_top_ingredients', surfaces: ['agent'], toolset: 'ui' },
  { name: 'get_trends', surfaces: ['agent', 'mcp'], toolset: 'analytics' },
  { name: 'get_usage_stats', surfaces: ['mcp'], toolset: 'core' },
  { name: 'get_video_analytics', surfaces: ['mcp'], toolset: 'analytics' },
  { name: 'get_video_status', surfaces: ['mcp'], toolset: 'generation' },
  { name: 'get_workflow_inputs', surfaces: ['agent'], toolset: 'workflows' },
  {
    name: 'get_workflow_run',
    surfaces: ['agent', 'mcp'],
    toolset: 'workflows',
  },
  { name: 'get_workflow_status', surfaces: ['mcp'], toolset: 'workflows' },
  { name: 'ingest_source_media', surfaces: ['agent'], toolset: 'ui' },
  {
    name: 'initiate_oauth_connect',
    surfaces: ['agent'],
    toolset: 'onboarding',
  },
  {
    name: 'inspect_workflow',
    surfaces: ['agent', 'mcp'],
    toolset: 'workflows',
  },
  {
    name: 'install_official_workflow',
    surfaces: ['agent'],
    toolset: 'workflows',
  },
  {
    name: 'install_skills_pro_skill',
    surfaces: ['mcp'],
    toolset: 'skills-pro',
  },
  {
    name: 'install_system_workflow',
    surfaces: ['agent', 'mcp'],
    toolset: 'workflows',
  },
  { name: 'list_ads_research', surfaces: ['agent', 'mcp'], toolset: 'ads' },
  {
    name: 'list_agent_conversations',
    surfaces: ['agent'],
    toolset: 'agent-chat',
  },
  { name: 'list_avatars', surfaces: ['mcp'], toolset: 'generation' },
  {
    name: 'list_brand_publishing_readiness',
    surfaces: ['mcp'],
    toolset: 'brand',
  },
  { name: 'list_brands', surfaces: ['agent', 'mcp'], toolset: 'core' },
  {
    name: 'list_characters',
    surfaces: ['agent', 'mcp'],
    toolset: 'generation',
  },
  { name: 'list_clip_projects', surfaces: ['mcp'], toolset: 'clips' },
  { name: 'list_genfeed_tools', surfaces: ['agent'], toolset: 'core' },
  { name: 'list_google_ads_campaigns', surfaces: ['mcp'], toolset: 'ads' },
  { name: 'list_google_ads_customers', surfaces: ['mcp'], toolset: 'ads' },
  { name: 'list_images', surfaces: ['mcp'], toolset: 'generation' },
  {
    name: 'list_instagram_inspiration',
    surfaces: ['agent', 'mcp'],
    toolset: 'inspiration',
  },
  {
    name: 'list_knowledge_sources',
    surfaces: ['agent', 'mcp'],
    toolset: 'knowledge',
  },
  { name: 'list_meta_ad_accounts', surfaces: ['mcp'], toolset: 'ads' },
  { name: 'list_meta_ad_creatives', surfaces: ['mcp'], toolset: 'ads' },
  { name: 'list_meta_campaigns', surfaces: ['mcp'], toolset: 'ads' },
  { name: 'list_music', surfaces: ['mcp'], toolset: 'generation' },
  { name: 'list_posts', surfaces: ['agent', 'mcp'], toolset: 'content' },
  { name: 'list_review_queue', surfaces: ['agent'], toolset: 'content' },
  {
    name: 'list_scheduler_capabilities',
    surfaces: ['mcp'],
    toolset: 'scheduler',
  },
  {
    name: 'list_social_conversations',
    surfaces: ['mcp'],
    toolset: 'social-inbox',
  },
  {
    name: 'list_system_workflow_catalog',
    surfaces: ['agent', 'mcp'],
    toolset: 'workflows',
  },
  { name: 'list_tiktok_ad_accounts', surfaces: ['mcp'], toolset: 'ads' },
  { name: 'list_tiktok_adgroups', surfaces: ['mcp'], toolset: 'ads' },
  { name: 'list_tiktok_ads', surfaces: ['mcp'], toolset: 'ads' },
  { name: 'list_tiktok_campaigns', surfaces: ['mcp'], toolset: 'ads' },
  { name: 'list_toolsets', surfaces: ['mcp'], toolset: 'core' },
  { name: 'list_videos', surfaces: ['mcp'], toolset: 'generation' },
  {
    name: 'list_workflow_runs',
    surfaces: ['agent', 'mcp'],
    toolset: 'workflows',
  },
  { name: 'list_workflow_templates', surfaces: ['mcp'], toolset: 'workflows' },
  { name: 'list_workflows', surfaces: ['agent', 'mcp'], toolset: 'workflows' },
  {
    name: 'list_x_account_activity',
    surfaces: ['agent', 'mcp'],
    toolset: 'social-inbox',
  },
  { name: 'manage_livestream_bot', surfaces: ['agent'], toolset: 'engagement' },
  {
    name: 'mark_social_conversation_resolved',
    surfaces: ['mcp'],
    toolset: 'social-inbox',
  },
  { name: 'open_studio_handoff', surfaces: ['agent'], toolset: 'ui' },
  { name: 'pause_outreach_sequence', surfaces: ['agent'], toolset: 'outreach' },
  {
    isPublishingApprovalRequired: true,
    name: 'post_social_reply',
    surfaces: ['mcp'],
    toolset: 'social-inbox',
  },
  { name: 'prepare_ad_launch_review', surfaces: ['agent'], toolset: 'ads' },
  { name: 'prepare_clip_workflow_run', surfaces: ['agent'], toolset: 'ui' },
  { name: 'prepare_generation', surfaces: ['agent'], toolset: 'ui' },
  { name: 'prepare_voice_clone', surfaces: ['agent'], toolset: 'ui' },
  { name: 'prepare_workflow_trigger', surfaces: ['agent'], toolset: 'ui' },
  { name: 'present_payment_options', surfaces: ['agent'], toolset: 'ui' },
  { name: 'present_work_object', surfaces: ['agent'], toolset: 'ui' },
  { name: 'rate_content', surfaces: ['agent'], toolset: 'content' },
  { name: 'rate_ingredient', surfaces: ['agent'], toolset: 'ui' },
  {
    name: 'read_knowledge_source',
    surfaces: ['agent', 'mcp'],
    toolset: 'knowledge',
  },
  { name: 'reframe_image', surfaces: ['agent', 'mcp'], toolset: 'generation' },
  { name: 'reject_social_draft', surfaces: ['mcp'], toolset: 'social-inbox' },
  { name: 'rename_brand', surfaces: ['agent'], toolset: 'onboarding' },
  { name: 'render_dashboard', surfaces: ['agent'], toolset: 'ui' },
  { name: 'replicate_top_ingredient', surfaces: ['agent'], toolset: 'ui' },
  { name: 'repurpose_post', surfaces: ['agent', 'mcp'], toolset: 'content' },
  { name: 'request_asset', surfaces: ['agent'], toolset: 'agent-chat' },
  { name: 'request_input', surfaces: ['agent'], toolset: 'ui' },
  { name: 'resolve_approval', surfaces: ['mcp'], toolset: 'core' },
  { name: 'resolve_handle', surfaces: ['agent'], toolset: 'onboarding' },
  {
    name: 'retry_knowledge_ingestion',
    surfaces: ['agent', 'mcp'],
    toolset: 'knowledge',
  },
  { name: 'save_brand_voice_profile', surfaces: ['agent'], toolset: 'brand' },
  { name: 'save_dashboard_layout', surfaces: ['agent'], toolset: 'ui' },
  { name: 'schedule_post', surfaces: ['agent'], toolset: 'content' },
  { name: 'score_seo', surfaces: ['agent'], toolset: 'content' },
  { name: 'search_articles', surfaces: ['mcp'], toolset: 'content' },
  {
    name: 'search_knowledge',
    surfaces: ['agent', 'mcp'],
    toolset: 'knowledge',
  },
  { name: 'search_tools', surfaces: ['mcp'], toolset: 'core' },
  { name: 'search_x_posts', surfaces: ['agent', 'mcp'], toolset: 'content' },
  { name: 'select_ingredient', surfaces: ['agent'], toolset: 'ui' },
  { name: 'send_chat_message', surfaces: ['mcp'], toolset: 'agent-chat' },
  {
    isPublishingApprovalRequired: true,
    name: 'send_social_dm',
    surfaces: ['mcp'],
    toolset: 'social-inbox',
  },
  {
    name: 'set_workflow_schedule',
    surfaces: ['agent', 'mcp'],
    toolset: 'workflows',
  },
  {
    name: 'skip_brand_interview_question',
    surfaces: ['agent', 'mcp'],
    toolset: 'brand',
  },
  { name: 'spawn_content_agent', surfaces: ['agent'], toolset: 'content' },
  {
    name: 'start_brand_interview',
    surfaces: ['agent', 'mcp'],
    toolset: 'brand',
  },
  { name: 'start_outreach_sequence', surfaces: ['agent'], toolset: 'outreach' },
  {
    name: 'submit_brand_interview_answer',
    surfaces: ['agent', 'mcp'],
    toolset: 'brand',
  },
  {
    name: 'suggest_ingredient_alternatives',
    surfaces: ['agent'],
    toolset: 'ui',
  },
  // Agent-only: renders conversational choices as in-product controls. MCP
  // clients own their own affordances and have no card surface to render into.
  { name: 'suggest_next_steps', surfaces: ['agent'], toolset: 'ui' },
  {
    name: 'tag_social_conversation',
    surfaces: ['mcp'],
    toolset: 'social-inbox',
  },
  {
    name: 'transfer_agent_conversation',
    surfaces: ['agent'],
    toolset: 'agent-chat',
  },
  { name: 'update_goal', surfaces: ['agent'], toolset: 'goals' },
  {
    isPublishingApprovalRequired: true,
    name: 'update_scheduled_release',
    surfaces: ['mcp'],
    toolset: 'scheduler',
  },
  { name: 'update_strategy_state', surfaces: ['agent'], toolset: 'engagement' },
  { name: 'upscale_image', surfaces: ['agent', 'mcp'], toolset: 'generation' },
  {
    name: 'validate_scheduler_target',
    surfaces: ['mcp'],
    toolset: 'scheduler',
  },
  {
    name: 'verify_skills_pro_entitlement',
    surfaces: ['mcp'],
    toolset: 'skills-pro',
  },
] as const satisfies readonly CuratedActionCatalogEntry[];

export type CuratedActionName = (typeof CURATED_ACTION_CATALOG)[number]['name'];

const CURATED_ACTION_NAMES = new Set<string>(
  CURATED_ACTION_CATALOG.map((entry) => entry.name),
);

export function isCuratedActionName(value: string): value is CuratedActionName {
  return CURATED_ACTION_NAMES.has(value);
}

export function isActionOnSurface(
  entry: CuratedActionCatalogEntry,
  surface: CuratedActionSurface,
): boolean {
  return entry.surfaces.some((candidate) => candidate === surface);
}

export function isPublishingApprovalRequired(
  entry: CuratedActionCatalogEntry,
): boolean {
  return entry.isPublishingApprovalRequired === true;
}
