/**
 * Agent-initiated publish policy decision. Prisma-backed on AgentPublishAudit.
 * Foundation for #1140.
 */

export enum AgentPublishDecision {
  PERMITTED = 'PERMITTED',
  DENIED = 'DENIED',
}
