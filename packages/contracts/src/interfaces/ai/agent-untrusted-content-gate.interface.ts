/**
 * Untrusted-content injection gate (#4870, epic #4863).
 *
 * A boolean typed decision on inbound tool results: "does this content try to
 * instruct the assistant or change its task". It may only tighten what the
 * agent sees — the regex scrub and the untrusted framing stay unconditional,
 * and an unavailable decision is exactly today's behaviour.
 */

import type { TypedDecisionMode } from './typed-decision.interface';

/**
 * Where the content in a tool result came from. Only externally authored
 * sources are worth a decision; everything the platform derived itself is
 * `internal` and never reaches the provider.
 */
export const AGENT_UNTRUSTED_CONTENT_SOURCES = [
  'connector',
  'internal',
  'user_upload',
  'web_fetch',
] as const;

export type AgentUntrustedContentSource =
  (typeof AGENT_UNTRUSTED_CONTENT_SOURCES)[number];

/** Persisted `source` columns are plain strings; unknown labels read as internal. */
export function parseAgentUntrustedContentSource(
  value: string | null | undefined,
): AgentUntrustedContentSource {
  return (
    AGENT_UNTRUSTED_CONTENT_SOURCES.find((source) => source === value) ??
    'internal'
  );
}

/**
 * What the gate did with one tool result.
 * - `allowed`: no decision, below threshold, or `null` — today's behaviour.
 * - `shadow_flagged`: above threshold in `shadow` mode; content still passed
 *   through, recorded so the false-positive rate can be sized before `live`.
 * - `withheld`: above threshold in `live` mode; content kept out of context.
 */
export const AGENT_UNTRUSTED_CONTENT_GATE_OUTCOMES = [
  'allowed',
  'shadow_flagged',
  'withheld',
] as const;

export type AgentUntrustedContentGateOutcome =
  (typeof AGENT_UNTRUSTED_CONTENT_GATE_OUTCOMES)[number];

/** Persisted `outcome` columns are plain strings; unknown labels read as allowed. */
export function parseAgentUntrustedContentGateOutcome(
  value: string | null | undefined,
): AgentUntrustedContentGateOutcome {
  return (
    AGENT_UNTRUSTED_CONTENT_GATE_OUTCOMES.find(
      (outcome) => outcome === value,
    ) ?? 'allowed'
  );
}

export interface AgentUntrustedContentGateResult {
  /** Provider confidence, absent when no decision was made. */
  confidence?: number;
  /** What the model sees: the original content, or the withheld notice. */
  content: string;
  outcome: AgentUntrustedContentGateOutcome;
}

export interface CreateAgentUntrustedContentAuditInput {
  agentStrategyId?: string | null;
  agentThreadId?: string | null;
  brandId?: string | null;
  confidence: number;
  contentLength: number;
  minConfidence: number;
  mode: TypedDecisionMode;
  organizationId: string;
  origin: AgentUntrustedContentOrigin;
  outcome: AgentUntrustedContentGateOutcome;
  source: AgentUntrustedContentSource;
  toolName: string;
  userId: string;
  workflowExecutionId?: string | null;
}

export interface IAgentUntrustedContentAuditDocument {
  agentStrategyId: string | null;
  agentThreadId: string | null;
  brandId: string | null;
  confidence: number;
  contentLength: number;
  createdAt: Date;
  id: string;
  isDeleted: boolean;
  minConfidence: number;
  mode: string;
  organizationId: string;
  origin: AgentUntrustedContentOrigin;
  outcome: AgentUntrustedContentGateOutcome;
  source: AgentUntrustedContentSource;
  toolName: string;
  updatedAt: Date;
  userId: string;
  workflowExecutionId: string | null;
}

/**
 * Tools whose results carry text the open web authored: pages, articles,
 * search snippets, public social posts, competitor ad copy.
 */
export const WEB_FETCH_TOOLS: ReadonlySet<string> = new Set<string>([
  'capture_knowledge',
  'create_clip_project_from_youtube',
  'get_ad_research_detail',
  'get_articles',
  'get_instagram_inspiration_detail',
  'get_trends',
  'get_x_posts',
  'list_ads_research',
  'list_instagram_inspiration',
  'list_outlier_posts',
  'read_knowledge_source',
  'resolve_handle',
  'scan_brand_url',
  'search_knowledge',
]);

/**
 * Tools whose results carry text a connected third-party account authored —
 * anyone who can comment, DM or reply to the brand can write into these.
 */
export const CONNECTOR_TOOLS: ReadonlySet<string> = new Set<string>([
  'discover_engagements',
  'get_social_conversation',
  'list_agent_conversations',
  'list_social_conversations',
  'list_x_account_activity',
]);

/** Tools whose results carry text extracted from a file the user supplied. */
export const USER_UPLOAD_TOOLS: ReadonlySet<string> = new Set<string>([
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

export const MCP_TOOL_RESULT_MAX_JSON_BYTES = 1024 * 1024;

export const AGENT_UNTRUSTED_CONTENT_ORIGINS = ['agent', 'mcp'] as const;
export type AgentUntrustedContentOrigin =
  (typeof AGENT_UNTRUSTED_CONTENT_ORIGINS)[number];
export function parseAgentUntrustedContentOrigin(
  value: string | null | undefined,
): AgentUntrustedContentOrigin {
  return (
    AGENT_UNTRUSTED_CONTENT_ORIGINS.find((origin) => origin === value) ??
    'agent'
  );
}
