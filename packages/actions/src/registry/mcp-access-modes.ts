/** Endpoint and OAuth grant policy, independent of the client's reported name. */
export type McpAccessMode = 'standard' | 'claude';

export function parseMcpAccessMode(value: unknown): McpAccessMode {
  return value === undefined || value === 'standard' ? 'standard' : 'claude';
}

export function mostRestrictiveMcpAccessMode(
  ...modes: unknown[]
): McpAccessMode {
  return modes.some((mode) => parseMcpAccessMode(mode) === 'claude')
    ? 'claude'
    : 'standard';
}

/** Future tools remain unavailable until their execution paths are reviewed. */
export const CLAUDE_MCP_TOOL_NAMES: ReadonlySet<string> = new Set([
  'get_account',
  'get_brands',
  'find_tools',
  'onboard_brand',
  'get_brand_context',
  'get_brand_completeness',
  'get_brand_scan_status',
  'list_brand_publishing_readiness',
  'create_brand_from_url',
  'start_brand_interview',
  'submit_brand_interview_answer',
  'skip_brand_interview_question',
  'create_post',
  'get_posts',
  'get_articles',
  'create_article_draft',
  'get_article_preview',
  'get_scheduler_capabilities',
  'validate_scheduler_target',
  'create_scheduled_release',
  'get_scheduled_release',
  'update_scheduled_release',
  'control_scheduled_release',
  'get_analytics',
  'analyze_performance',
  'get_content_analytics',
  'get_video_analytics',
  'get_linkedin_analytics',
  'get_linkedin_connection_status',
  'get_trends',
  'list_assets',
]);

/** The onboarding MCP adapter invokes these reviewed internal operations. */
export const CLAUDE_MCP_AGENT_TOOL_NAMES: ReadonlySet<string> = new Set([
  ...CLAUDE_MCP_TOOL_NAMES,
  'scan_brand_url',
  'save_onboarding_answers',
  'complete_onboarding',
]);

export function isToolAllowedInMcpAccessMode(
  mode: McpAccessMode,
  name: string,
  surface: 'mcp' | 'agent' = 'mcp',
): boolean {
  return (
    mode === 'standard' ||
    (surface === 'agent'
      ? CLAUDE_MCP_AGENT_TOOL_NAMES
      : CLAUDE_MCP_TOOL_NAMES
    ).has(name)
  );
}
