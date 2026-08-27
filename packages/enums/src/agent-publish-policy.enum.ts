/**
 * Agent-initiated publish policy decision. Prisma-backed on AgentPublishAudit.
 * Foundation for #1140.
 */

export enum AgentPublishDecision {
  PERMITTED = 'PERMITTED',
  DENIED = 'DENIED',
}

export function parseAgentPublishDecision(
  value: string | null | undefined,
): AgentPublishDecision {
  switch (value) {
    case AgentPublishDecision.PERMITTED:
      return AgentPublishDecision.PERMITTED;
    case AgentPublishDecision.DENIED:
      return AgentPublishDecision.DENIED;
    default:
      return AgentPublishDecision.DENIED;
  }
}
