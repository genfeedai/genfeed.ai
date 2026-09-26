/**
 * `perceive` runs every artefact the asset still lacks; `retry` re-attempts
 * only the artefacts left `pending` by a provider outage.
 */
export type MediaPerceptionJobReason = 'perceive' | 'retry';

export interface MediaPerceptionJobData {
  ingredientId: string;
  organizationId: string;
  reason: MediaPerceptionJobReason;
}

/** Retryable artefacts are re-attempted this many times before `failed`. */
export const MEDIA_PERCEPTION_MAX_ATTEMPTS = 5;

/** Base delay between retry attempts; doubles per attempt. */
export const MEDIA_PERCEPTION_RETRY_BASE_DELAY_MS = 5 * 60 * 1000;
