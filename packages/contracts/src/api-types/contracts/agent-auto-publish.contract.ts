import { z } from 'zod';
import { AgentAutonomyMode, normalizeAgentAutonomyMode } from '../..';

export const agentAutoPublishPolicyIdValues = [
  'supervised.require_approval',
  'brand.auto_publish_disabled',
  'channel.auto_publish_blocked',
  'auto_publish.permitted',
] as const;

export const agentAutoPublishPolicyIdSchema = z.enum(
  agentAutoPublishPolicyIdValues,
);

export type AgentAutoPublishPolicyId = z.infer<
  typeof agentAutoPublishPolicyIdSchema
>;

export const evaluateAgentAutoPublishPolicyInputSchema = z.object({
  autonomyMode: z.unknown(),
  brandAutoPublishEnabled: z.boolean(),
  blockedChannels: z.array(z.string().min(1)).optional(),
  channel: z.string().min(1),
});

export type EvaluateAgentAutoPublishPolicyInput = z.infer<
  typeof evaluateAgentAutoPublishPolicyInputSchema
>;

export interface AgentAutoPublishPolicyDecision {
  channel: string;
  isPermitted: boolean;
  policyId: AgentAutoPublishPolicyId;
  requiresApproval: boolean;
}

/**
 * Policy matrix over autonomy mode, brand auto-publish, and channel.
 *
 * SUPERVISED always requires a human confirmation card. AUTO_PUBLISH is
 * permitted only when the brand toggle is on and the channel is not blocked.
 * Unknown autonomy values fall back to SUPERVISED via
 * {@link normalizeAgentAutonomyMode}.
 */
export function evaluateAgentAutoPublishPolicy(
  input: EvaluateAgentAutoPublishPolicyInput,
): AgentAutoPublishPolicyDecision {
  const parsed = evaluateAgentAutoPublishPolicyInputSchema.parse(input);
  const autonomyMode = normalizeAgentAutonomyMode(parsed.autonomyMode);
  const channel = parsed.channel.trim().toLowerCase();
  const blockedChannels = new Set(
    (parsed.blockedChannels ?? []).map((value) => value.trim().toLowerCase()),
  );

  if (autonomyMode !== AgentAutonomyMode.AUTO_PUBLISH) {
    return {
      channel,
      isPermitted: false,
      policyId: 'supervised.require_approval',
      requiresApproval: true,
    };
  }

  if (!parsed.brandAutoPublishEnabled) {
    return {
      channel,
      isPermitted: false,
      policyId: 'brand.auto_publish_disabled',
      requiresApproval: true,
    };
  }

  if (blockedChannels.has(channel)) {
    return {
      channel,
      isPermitted: false,
      policyId: 'channel.auto_publish_blocked',
      requiresApproval: true,
    };
  }

  return {
    channel,
    isPermitted: true,
    policyId: 'auto_publish.permitted',
    requiresApproval: false,
  };
}

export function evaluateAgentAutoPublishPolicies(input: {
  autonomyMode: unknown;
  blockedChannels?: readonly string[];
  brandAutoPublishEnabled: boolean;
  channels: readonly string[];
}): {
  decisions: AgentAutoPublishPolicyDecision[];
  isPermitted: boolean;
  policyId: AgentAutoPublishPolicyId;
  requiresApproval: boolean;
} {
  const uniqueChannels = Array.from(
    new Set(
      input.channels
        .map((channel) => channel.trim().toLowerCase())
        .filter((channel) => channel.length > 0),
    ),
  );
  const channels = uniqueChannels.length > 0 ? uniqueChannels : ['unknown'];
  const decisions = channels.map((channel) =>
    evaluateAgentAutoPublishPolicy({
      autonomyMode: input.autonomyMode,
      blockedChannels: [...(input.blockedChannels ?? [])],
      brandAutoPublishEnabled: input.brandAutoPublishEnabled,
      channel,
    }),
  );
  const denied = decisions.find((decision) => !decision.isPermitted);

  if (denied) {
    return {
      decisions,
      isPermitted: false,
      policyId: denied.policyId,
      requiresApproval: true,
    };
  }

  return {
    decisions,
    isPermitted: true,
    policyId: 'auto_publish.permitted',
    requiresApproval: false,
  };
}
