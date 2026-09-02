import { z } from 'zod';
import { AgentAutonomyMode, AgentPublishDecision } from '../..';

export const AGENT_PUBLISH_POLICY_NAME = 'autonomy-brand-channel';

export const agentPublishPolicyInputSchema = z.object({
  autonomyMode: z.nativeEnum(AgentAutonomyMode),
  brandAllowsAutoPublish: z.boolean(),
  channelAllowsAutoPublish: z.boolean(),
});

export type AgentPublishPolicyInput = z.infer<
  typeof agentPublishPolicyInputSchema
>;

export interface AgentPublishPolicyResult {
  decision: AgentPublishDecision;
  policyName: typeof AGENT_PUBLISH_POLICY_NAME;
  reason: string;
}

/**
 * Auto-publish is permitted only when autonomy is AUTO_PUBLISH and both the
 * brand and the destination channel have opted in. SUPERVISED always requires
 * human approval.
 */
export function evaluateAgentPublishPolicy(
  input: AgentPublishPolicyInput,
): AgentPublishPolicyResult {
  const parsed = agentPublishPolicyInputSchema.parse(input);

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
