import { createEntityAttributes } from '@genfeedai/helpers';

export const xAdWatchedAdvertiserAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'credentialId',
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
