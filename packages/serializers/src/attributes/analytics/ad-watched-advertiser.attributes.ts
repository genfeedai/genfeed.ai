import { createEntityAttributes } from '@genfeedai/helpers';

export const adWatchedAdvertiserAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'credentialId',
  'platform',
  'advertiserHandle',
  'advertiserName',
  'externalAdvertiserId',
  'freshnessState',
  'lastAttemptedAt',
  'lastSuccessfulAt',
  'lastIngestionStatus',
  'lastIngestionErrorCode',
  'lastSnapshotId',
  'lastSnapshotRecordCount',
]);
