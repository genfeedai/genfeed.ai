import { createEntityAttributes } from '@genfeedai/helpers';

export const batchAttributes = createEntityAttributes([
  'organization',
  'brand',
  'status',
  'totalCount',
  'completedCount',
  'failedCount',
  'contentMix',
  'platforms',
  'topics',
  'dateRangeStart',
  'dateRangeEnd',
  'style',
  'items',
  'source',
  'agentStrategy',
  'completedAt',
]);
