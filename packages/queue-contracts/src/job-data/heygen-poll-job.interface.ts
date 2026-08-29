/**
 * HeyGen Poll queue contract.
 *
 * Delayed polling jobs that check HeyGen video status. Used as a fallback
 * for localhost / self-hosted deployments where GENFEEDAI_WEBHOOKS_URL is
 * not reachable from HeyGen.
 */
export const HEYGEN_POLL_DELAY_MS = 15_000;
export const HEYGEN_POLL_MAX_ATTEMPTS = 40; // ≈10 min ceiling at 15s cadence

export interface HeygenPollJobData {
  /** Exact durable workflow continuation that owns this provider job. */
  continuationId: string;
  /** Ingredient ID that owns the HeyGen generation (used as callbackId). */
  ingredientId: string;
  /** HeyGen external task/video id returned by generatePhotoAvatarVideo. */
  externalId: string;
  /** Organization context for BYOK resolution. */
  organizationId: string;
  /** Attempt counter — job reschedules itself with this incremented. */
  attempt: number;
}
