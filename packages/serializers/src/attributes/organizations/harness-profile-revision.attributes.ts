import { createEntityAttributes } from '@genfeedai/helpers';

export const harnessProfileRevisionAttributes = createEntityAttributes([
  'organization',
  'harnessProfileId',
  'brandId',
  'version',
  'source',
  'actorUserId',
  'actorLabel',
  'rolledBackToVersion',
  'snapshot',
]);
