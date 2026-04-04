import { createEntityAttributes } from '@genfeedai/helpers';

export const contentDraftAttributes = createEntityAttributes([
  'organization',
  'brand',
  'skillSlug',
  'contentRunId',
  'type',
  'content',
  'mediaUrls',
  'platforms',
  'metadata',
  'status',
  'confidence',
  'generatedBy',
  'approvedBy',
]);
