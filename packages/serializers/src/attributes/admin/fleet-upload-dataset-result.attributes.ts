import { createEntityAttributes } from '@genfeedai/helpers';

export const fleetUploadDatasetResultAttributes = createEntityAttributes([
  'failed',
  'failedCount',
  'uploadedCount',
]);
