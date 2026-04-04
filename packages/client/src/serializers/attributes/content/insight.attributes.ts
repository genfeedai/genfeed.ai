import { createEntityAttributes } from '@genfeedai/helpers';

export const insightAttributes = createEntityAttributes([
  'organization',
  'category',
  'title',
  'description',
  'impact',
  'confidence',
  'actionableSteps',
  'relatedMetrics',
  'data',
  'isRead',
  'isDismissed',
  'expiresAt',
]);
