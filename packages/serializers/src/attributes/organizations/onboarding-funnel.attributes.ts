import { createEntityAttributes } from '@genfeedai/helpers';

export const onboardingFunnelAttributes = createEntityAttributes([
  'byEmailClass',
  'generatedAt',
  'organizations',
  'since',
  'totals',
  'windowDays',
]);
