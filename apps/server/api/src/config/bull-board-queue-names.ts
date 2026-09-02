import { ALL_QUEUE_NAMES } from '@genfeedai/contracts/queue';

/** Service-local queues that have not moved into the API/workers contract. */
export const BULL_BOARD_AUXILIARY_QUEUE_NAMES = [
  'file-processing',
  'image-processing',
  'task-processing',
  'video-processing',
  'youtube-processing',
] as const;

/**
 * Bull Board consumes the canonical queue contract directly so a new API or
 * workers queue is visible without a second registration change.
 */
export const BULL_BOARD_QUEUE_NAMES = [
  ...ALL_QUEUE_NAMES,
  ...BULL_BOARD_AUXILIARY_QUEUE_NAMES,
] as const;
