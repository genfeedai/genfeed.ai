import { ContentFormat } from '@genfeedai/enums';

export const REVIEW_BATCH_ITEM_FORMATS = [
  ...Object.values(ContentFormat),
  'article',
  'newsletter',
  'post',
] as const;

export type ReviewBatchItemFormat = (typeof REVIEW_BATCH_ITEM_FORMATS)[number];
