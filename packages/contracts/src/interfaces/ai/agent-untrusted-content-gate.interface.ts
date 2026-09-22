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
  outcome: AgentUntrustedContentGateOutcome;
  source: AgentUntrustedContentSource;
  toolName: string;
  updatedAt: Date;
  userId: string;
  workflowExecutionId: string | null;
}
