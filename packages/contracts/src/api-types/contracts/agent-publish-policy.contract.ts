import { z } from 'zod';
import { AgentAutonomyMode, AgentPublishDecision } from '../..';

export const AGENT_PUBLISH_POLICY_NAME = 'autonomy-brand-channel';

/**
 * The part of a media assessment (#4881) the policy reads. Optional: an
 * absent assessment yields exactly the autonomy × brand × channel decision.
 */
export const agentPublishMediaAssessmentSchema = z.object({
  isBlocking: z.boolean(),
  reasons: z.array(z.string().min(1)),
});

export const agentPublishPolicyInputSchema = z.object({
  autonomyMode: z.nativeEnum(AgentAutonomyMode),
  brandAllowsAutoPublish: z.boolean(),
  channelAllowsAutoPublish: z.boolean(),
  mediaAssessment: agentPublishMediaAssessmentSchema.optional(),
});

export type AgentPublishMediaAssessment = z.infer<
  typeof agentPublishMediaAssessmentSchema
>;

export type AgentPublishPolicyInput = z.infer<
  typeof agentPublishPolicyInputSchema
>;

export interface AgentPublishPolicyResult {
  decision: AgentPublishDecision;
  /** Why media forced review, for the publish card; absent when it did not. */
  mediaAssessmentReasons?: string[];
  policyName: typeof AGENT_PUBLISH_POLICY_NAME;
  reason: string;
}

/**
 * Tighten a decision with a media assessment (#4881). Tighten-only by
 * construction: a blocking assessment can turn PERMITTED into DENIED
 * (review required) and never the reverse; a denial keeps its own reason.
 */
export function applyMediaAssessmentToPublishPolicy(
  result: AgentPublishPolicyResult,
  assessment: AgentPublishMediaAssessment | undefined,
): AgentPublishPolicyResult {
  if (!assessment?.isBlocking) {
    return result;
  }
  const reasons =
    assessment.reasons.length > 0
      ? assessment.reasons
      : ['Media assessment requires review.'];
  if (result.decision === AgentPublishDecision.DENIED) {
    return { ...result, mediaAssessmentReasons: reasons };
  }
  return {
    decision: AgentPublishDecision.DENIED,
    mediaAssessmentReasons: reasons,
    policyName: AGENT_PUBLISH_POLICY_NAME,
    reason: `Media review required: ${reasons.join('; ')}`,
  };
}

/**
 * Auto-publish is permitted only when autonomy is AUTO_PUBLISH and both the
 * brand and the destination channel have opted in. SUPERVISED always requires
 * human approval. A blocking media assessment turns an otherwise permitted
 * auto-publish into review-required; it can never permit anything.
 */
export function evaluateAgentPublishPolicy(
  input: AgentPublishPolicyInput,
): AgentPublishPolicyResult {
  const parsed = agentPublishPolicyInputSchema.parse(input);
  return applyMediaAssessmentToPublishPolicy(
    evaluateAutonomyBrandChannel(parsed),
    parsed.mediaAssessment,
  );
}

function evaluateAutonomyBrandChannel(
  parsed: AgentPublishPolicyInput,
): AgentPublishPolicyResult {
  if (parsed.autonomyMode !== AgentAutonomyMode.AUTO_PUBLISH) {
    return {
      decision: AgentPublishDecision.DENIED,
      policyName: AGENT_PUBLISH_POLICY_NAME,
      reason: 'Autonomy mode requires human approval.',
    };
  }

  if (!parsed.brandAllowsAutoPublish) {
    return {
      decision: AgentPublishDecision.DENIED,
      policyName: AGENT_PUBLISH_POLICY_NAME,
      reason: 'Brand auto-publish is disabled.',
    };
  }

  if (!parsed.channelAllowsAutoPublish) {
    return {
      decision: AgentPublishDecision.DENIED,
      policyName: AGENT_PUBLISH_POLICY_NAME,
      reason: 'Channel auto-publish is disabled.',
    };
  }

  return {
    decision: AgentPublishDecision.PERMITTED,
    policyName: AGENT_PUBLISH_POLICY_NAME,
    reason: 'Autonomy mode, brand, and channel all permit auto-publish.',
  };
}
