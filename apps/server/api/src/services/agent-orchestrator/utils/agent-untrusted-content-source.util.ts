import type { CuratedActionName } from '@genfeedai/actions';
import type { AgentUntrustedContentSource } from '@genfeedai/contracts/interfaces';

/**
 * Tools whose results carry text the open web authored: pages, articles,
 * search snippets, public social posts, competitor ad copy.
 */
const WEB_FETCH_TOOLS: ReadonlySet<string> = new Set<CuratedActionName>([
  'capture_knowledge',
  'create_clip_project_from_youtube',
  'fetch_x_post',
  'get_ad_research_detail',
  'get_instagram_inspiration_detail',
  'get_trends',
  'list_ads_research',
  'list_instagram_inspiration',
  'list_outlier_posts',
  'read_knowledge_source',
  'resolve_handle',
  'search_articles',
  'search_knowledge',
  'search_x_posts',
]);

/**
 * Tools whose results carry text a connected third-party account authored —
 * anyone who can comment, DM or reply to the brand can write into these.
 */
const CONNECTOR_TOOLS: ReadonlySet<string> = new Set<CuratedActionName>([
  'discover_engagements',
  'get_account_info',
  'get_social_conversation',
  'list_agent_conversations',
  'list_social_conversations',
  'list_x_account_activity',
]);

/** Tools whose results carry text extracted from a file the user supplied. */
const USER_UPLOAD_TOOLS: ReadonlySet<string> = new Set<CuratedActionName>([
  'ingest_source_media',
  'request_asset',
]);

/**
 * Classify where a tool result's text came from (#4870).
 *
 * Only externally authored content is worth an injection decision, so
 * everything the platform derived itself — analytics rollups, credit
 * balances, workflow state — classifies as `internal` and the gate skips it.
 * This set is the one place to widen the gate's reach as tools are added.
 */
export function readAgentUntrustedContentSource(
  toolName: string,
): AgentUntrustedContentSource {
  if (WEB_FETCH_TOOLS.has(toolName)) {
    return 'web_fetch';
  }
  if (CONNECTOR_TOOLS.has(toolName)) {
    return 'connector';
  }
  if (USER_UPLOAD_TOOLS.has(toolName)) {
    return 'user_upload';
  }
  return 'internal';
}

/** `internal` content never reaches the decision provider. */
export function isAgentUntrustedContentSource(
  source: AgentUntrustedContentSource,
): boolean {
  return source !== 'internal';
}
