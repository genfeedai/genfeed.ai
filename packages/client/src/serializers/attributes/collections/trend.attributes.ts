import { createEntityAttributes } from '@genfeedai/helpers';

export const trendAttributes = createEntityAttributes([
  'platform',
  'topic',
  'mentions',
  'growthRate',
  'viralityScore',
  'metadata',
  'requiresAuth',
  'isCurrent',
  'expiresAt',
]);
