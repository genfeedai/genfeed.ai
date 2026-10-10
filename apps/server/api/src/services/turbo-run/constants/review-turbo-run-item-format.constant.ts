import { ContentFormat } from '@genfeedai/contracts';

export const REVIEW_TURBO_RUN_ITEM_FORMATS = [
  ...Object.values(ContentFormat),
  'article',
  'newsletter',
  'post',
] as const;

export type ReviewTurboRunItemFormat =
  (typeof REVIEW_TURBO_RUN_ITEM_FORMATS)[number];
