import type { ToolMutationPolicy } from '../interfaces/tool-definition.interface';
import { curatedActionNames } from './curated-action-catalog';
import {
  getVisualMediaGenerationType,
  type VisualMediaGenerationType,
} from './media-generation';
import { isApprovalRequiredToolName } from './mutation-policy';

/**
 * String-literal mirror of `@genfeedai/contracts` `AgentThreadMode` — this
 * package stays dependency-free (see `MutationApprovalStatus` above for the
 * same pattern), so callers pass the enum's runtime string value.
 */
export type AgentThreadModeValue = 'auto' | 'manual' | 'plan';

/**
 * #4672 confirmation matrix. One of four buckets a write tool falls into —
 * `undefined` (from {@link getAgentActionClass}) means the tool is neither
 * credit-spending, brand-context, outbound, nor already gated, so mode never
 * changes its declared {@link ToolMutationPolicy}.
 */
export const AGENT_ACTION_CLASS = {
  /** Reaches real people or an external platform: send, publish, schedule. */
  OUTBOUND: 'outbound',
  /** Charges credits when it executes: media generation, credit-charged
   * content generation, workflows run on the user's behalf. */
  CREDIT_SPENDING: 'credit-spending',
  /** Creates or changes brand voice, memory, knowledge, strategy state, or
   * brand identity (create/rename/interview answers). */
  BRAND_CONTEXT: 'brand-context',
  /** Already approval-gated today and not one of the other three classes. */
  GATED: 'gated',
} as const;

export type AgentActionClass =
  (typeof AGENT_ACTION_CLASS)[keyof typeof AGENT_ACTION_CLASS];

/** Reaches people or external platforms — confirms in every mode. */
const OUTBOUND_TOOL_NAMES = curatedActionNames(
  (entry) => entry.actionClass === 'outbound',
);

/**
 * Charges credits on execution — media generation and paid workflows. Also
 * covers free tools that queue a render or analysis job, so Manual mode asks
 * before they build.
 */
const CREDIT_SPENDING_TOOL_NAMES = curatedActionNames(
  (entry) => entry.actionClass === 'credit-spending',
);

/**
 * Visual `generate` calls (image or video) the docked `generation_action_card`
 * reviews directly (prompt, resolved model, credit estimate) rather than
 * routing through the generic `mutation_approval_card`. They share the
 * prompt/aspectRatio/duration shape `AgentPrepareToolHandler.prepareGeneration`
 * already builds a preview from. Voice, music and `generate_as_identity`
 * (avatar `text`, no `prompt`) stay on the generic card even though they are
 * also `credit-spending`.
 */
export function getVisualGenerationReviewType(
  toolName: string,
  parameters: unknown,
): VisualMediaGenerationType | undefined {
  return getVisualMediaGenerationType(toolName, parameters);
}

/** Creates or rewrites brand context the Agent should not silently change. */
const BRAND_CONTEXT_TOOL_NAMES = curatedActionNames(
  (entry) => entry.actionClass === 'brand-context',
);

/**
 * Classifies a write tool for the mode-aware confirmation matrix. Order
 * matters: outbound wins over credit-spending (e.g. a future outbound tool
 * that also spends credits still always confirms).
 */
export function getAgentActionClass(
  toolName: string,
): AgentActionClass | undefined {
  if (OUTBOUND_TOOL_NAMES.has(toolName)) {
    return AGENT_ACTION_CLASS.OUTBOUND;
  }
  if (CREDIT_SPENDING_TOOL_NAMES.has(toolName)) {
    return AGENT_ACTION_CLASS.CREDIT_SPENDING;
  }
  if (BRAND_CONTEXT_TOOL_NAMES.has(toolName)) {
    return AGENT_ACTION_CLASS.BRAND_CONTEXT;
  }
  if (isApprovalRequiredToolName(toolName)) {
    return AGENT_ACTION_CLASS.GATED;
  }
  return undefined;
}

/**
 * Effective mutation policy for a tool under the thread's active mode —
 * the #4672 confirmation matrix:
 * - Outbound always confirms.
 * - Manual confirms credit-spending, brand-context, and gated actions too.
 * - Auto and Plan preserve existing approval requirements.
 *
 * `mode` is `undefined` for a call with no thread at all (MCP, CLI, a
 * recurring task, a system-triggered batch) — #4672 modes are a per-*thread*
 * concept, so those keep today's declared policy untouched rather than
 * inheriting Manual's confirm-everything default. A caller that DOES have a
 * thread but could not resolve its mode (storage unavailable, corrupt value)
 * must still pass a concrete mode — Manual, the fail-safe default — not
 * `undefined`, or it would wrongly fall back to this "no thread" branch.
 *
 * Falls back to the tool's statically declared policy when it is not one of
 * the four classified action classes — mundane writes (e.g. `create_chat`)
 * stay direct in every mode.
 */
export function resolveEffectiveMutationPolicy(
  toolName: string,
  mode: AgentThreadModeValue | undefined,
  declaredPolicy: ToolMutationPolicy | undefined,
): ToolMutationPolicy | undefined {
  if (declaredPolicy === 'approval-required' || mode === undefined) {
    return declaredPolicy;
  }
  const actionClass = getAgentActionClass(toolName);
  if (!actionClass) {
    return declaredPolicy;
  }
  if (actionClass === AGENT_ACTION_CLASS.OUTBOUND) {
    return 'approval-required';
  }
  if (mode !== 'auto' && mode !== 'plan') {
    return 'approval-required';
  }
  return 'direct';
}

/**
 * Credit spenders a workflow can fan out from into publishing, so a missing
 * approval there would reach people, not only spend credits.
 */
const MCP_APPROVAL_NEVER_SKIPPED_TOOL_NAMES = curatedActionNames(
  (entry) => entry.isMcpApprovalNeverSkipped === true,
);

/**
 * Publishing tools the OUTBOUND class does not list: they put content in front
 * of an audience, so an MCP call waits for a reviewer.
 */
const MCP_APPROVAL_POSTING_TOOL_NAMES = curatedActionNames(
  (entry) => entry.mcpApproval === 'posting',
);

/**
 * Media generation that is not in the CREDIT_SPENDING class: remix and
 * clipper runs render new media, so an MCP call waits for a reviewer.
 */
const MCP_APPROVAL_GENERATION_TOOL_NAMES = curatedActionNames(
  (entry) => entry.mcpApproval === 'generation',
);

/**
 * Whether an MCP call to this tool can ever wait in the approvals queue. Only
 * posting and media generation do. Reads, drafts, brand setup and everything
 * else run at once, whatever their credit cost; the API still checks the
 * caller's role and credit balance.
 */
export function isMcpApprovalScopeTool(toolName: string): boolean {
  const actionClass = getAgentActionClass(toolName);
  return (
    actionClass === AGENT_ACTION_CLASS.OUTBOUND ||
    actionClass === AGENT_ACTION_CLASS.CREDIT_SPENDING ||
    MCP_APPROVAL_POSTING_TOOL_NAMES.has(toolName) ||
    MCP_APPROVAL_GENERATION_TOOL_NAMES.has(toolName)
  );
}

/**
 * Whether the "Require approval for MCP requests" setting may waive the
 * approvals queue for this tool. Only plain credit spenders qualify (media and
 * content generation): the call still runs the credit balance check and quote.
 * Outbound, brand-context and other gated writes stay queued however the
 * setting is configured.
 */
export function isMcpApprovalSkippable(toolName: string): boolean {
  return (
    getAgentActionClass(toolName) === AGENT_ACTION_CLASS.CREDIT_SPENDING &&
    !MCP_APPROVAL_NEVER_SKIPPED_TOOL_NAMES.has(toolName)
  );
}
