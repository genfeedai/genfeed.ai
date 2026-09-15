import { createEntityAttributes } from '@genfeedai/helpers';
export const outlierConfigurationAttributes = createEntityAttributes([
  'organizationId',
  'windowSize',
  'minimumSampleSize',
  'outlierThreshold',
  'breakoutThreshold',
  'maturityHoursByPlatform',
]);
