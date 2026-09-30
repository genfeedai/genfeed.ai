import { createEntityAttributes } from '@genfeedai/helpers';

export const modelPricingReportAttributes = createEntityAttributes([
  'retrievedAt',
  'source',
  'isConversionPolicyConfigured',
  'rows',
]);
