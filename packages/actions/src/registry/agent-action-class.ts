import type { ToolMutationPolicy } from '../interfaces/tool-definition.interface';
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
const OUTBOUND_TOOL_NAMES = new Set<string>([
  'send_social_dm',
  'post_social_reply',
  'approve_social_draft',
  'schedule_post',
  'create_scheduled_release',
  'update_scheduled_release',
  'control_scheduled_release',
  'start_outreach_sequence',
  'pause_outreach_sequence',
]);

/** Charges credits on execution — media generation and paid workflows. */
const CREDIT_SPENDING_TOOL_NAMES = new Set<string>([
  'generate_ad_pack',
  'generate_as_identity',
  'generate_clips',
  'generate_content_batch',
  'generate_image',
  'generate_monthly_content',
  'generate_music',
  'generate_onboarding_content',
  'generate_video',
  'generate_voice',
  'reframe_image',
  'upscale_image',
  'execute_workflow',
]);

/**
 * Visual-generation tools the docked `generation_action_card` reviews
 * directly (prompt, resolved model, credit estimate) rather than routing
 * through the generic `mutation_approval_card`. Both share the
 * prompt/aspectRatio/duration shape `AgentPrepareToolHandler.prepareGeneration`
 * already builds a preview from — `generate_as_identity` (avatar `text`, no
 * `prompt`) does not, so it stays on the generic card even though it is also
 * `credit-spending`.
 */
export const VISUAL_GENERATION_REVIEW_TOOL_NAMES = new Set<string>([
  'generate_image',
  'generate_video',
]);

/** Creates or rewrites brand context the Agent should not silently change. */
const BRAND_CONTEXT_TOOL_NAMES = new Set<string>([
  'save_brand_voice_profile',
  'capture_memory',
  'capture_knowledge',
  'update_strategy_state',
  'create_brand',
  'rename_brand',
  'submit_brand_interview_answer',
  'skip_brand_interview_question',
  'start_brand_interview',
]);

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
 * - Auto and Plan (running its approved steps) confirm nothing but outbound.
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
  if (mode === undefined) {
    return declaredPolicy;
  }
  const actionClass = getAgentActionClass(toolName);
  if (!actionClass) {
    return declaredPolicy;
  }
  if (actionClass === AGENT_ACTION_CLASS.OUTBOUND) {
    return 'approval-required';
  }
  if (mode === 'manual') {
    return 'approval-required';
  }
  return 'direct';
}
