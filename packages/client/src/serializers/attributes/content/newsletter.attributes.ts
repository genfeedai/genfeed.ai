import { createEntityAttributes } from '@genfeedai/helpers';

export const newsletterAttributes = createEntityAttributes([
  'user',
  'organization',
  'brand',
  'label',
  'topic',
  'angle',
  'summary',
  'content',
  'status',
  'sourceRefs',
  'contextNewsletterIds',
  'generationPrompt',
  'agentRunId',
  'approvedByUser',
  'publishedByUser',
  'approvedAt',
  'publishedAt',
  'scheduledFor',
]);
