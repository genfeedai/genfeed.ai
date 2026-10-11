import type { WinnerSignal } from '../types/winner-signal';

/** Every signal a post can qualify as a winner on, in display order. */
export const WINNER_SIGNALS: readonly WinnerSignal[] = [
  'views',
  'engagementRate',
  'likes',
  'comments',
];
