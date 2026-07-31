/**
 * One dispatch tick of a throttled reply campaign. The tick claims at most one
 * recipient and re-enqueues itself with a delay, so pacing lives in the BullMQ
 * delay rather than in a worker-blocking sleep.
 */
export interface SocialReplyCampaignJobData {
  campaignId: string;
  organizationId: string;
  /**
   * Monotonic enqueue counter used to build the deterministic job id. A resume
   * bumps it so the new tick cannot collide with the delayed tick a pause left
   * behind.
   */
  dispatchCursor: number;
}

export type SocialReplyCampaignTickOutcome =
  | 'campaign-completed'
  | 'campaign-inactive'
  | 'recipient-failed'
  | 'recipient-sent'
  | 'recipient-skipped'
  | 'throttled';

export interface SocialReplyCampaignJobResult {
  /** Seconds until the next tick, when one was scheduled. */
  nextRunInSeconds?: number;
  outcome: SocialReplyCampaignTickOutcome;
  recipientId?: string;
}
