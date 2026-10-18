import { z } from 'zod';
import { AgentAutonomyMode, AgentPublishDecision } from '../..';
import type { IBrandPolicyViolation } from '../../interfaces/organization/brand-publish-policy.interface';
import {
  brandPolicyEvaluationInputSchema,
  evaluateBrandPublishPolicyRules,
} from './brand-publish-policy.contract';

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
  /**
   * The brand Policy and the draft it judges (#7339). Every unattended path
   * passes it; a brand with no approved Policy is judged by the default one.
   * It is absent only for a publish a member confirmed.
   */
  brandPolicy: brandPolicyEvaluationInputSchema.optional(),
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
  /** The brand Policy rules the draft broke, for the review item; absent when none. */
  policyViolations?: IBrandPolicyViolation[];
  policyName: typeof AGENT_PUBLISH_POLICY_NAME;
  reason: string;
}

/**
 * Tighten a decision with the brand Policy (#7339), the same way as a media
 * assessment: any violation turns PERMITTED into DENIED, never the reverse.
 * The violations are kept on a denial too, so the reviewer sees them.
 */
export function applyBrandPolicyToPublishPolicy(
  result: AgentPublishPolicyResult,
  violations: readonly IBrandPolicyViolation[],
): AgentPublishPolicyResult {
  if (violations.length === 0) {
    return result;
  }
  const policyViolations = [...violations];
  if (result.decision === AgentPublishDecision.DENIED) {
    return { ...result, policyViolations };
  }
  return {
    ...result,
    decision: AgentPublishDecision.DENIED,
    policyViolations,
    reason: `Brand Policy requires review: ${policyViolations
      .map((violation) => violation.detail)
      .join(' ')}`,
  };
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
 * The single publish gate. Auto-publish is permitted only when autonomy is
 * AUTO_PUBLISH and both the brand and the destination channel have opted in.
 * SUPERVISED always requires human approval. A blocking media assessment or
 * any broken brand Policy rule (video, caps, quiet hours, banned content,
 * score, required checks) turns an otherwise permitted
 * auto-publish into review-required; neither can permit anything.
 */
export function evaluateAgentPublishPolicy(
  input: AgentPublishPolicyInput,
): AgentPublishPolicyResult {
  const parsed = agentPublishPolicyInputSchema.parse(input);
  const violations = parsed.brandPolicy
    ? [
        ...evaluateBrandPublishPolicyRules(parsed.brandPolicy),
        ...parsed.brandPolicy.judgeViolations,
      ]
    : [];
  return applyBrandPolicyToPublishPolicy(
    applyMediaAssessmentToPublishPolicy(
      evaluateAutonomyBrandChannel(parsed),
      parsed.mediaAssessment,
    ),
    violations,
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
