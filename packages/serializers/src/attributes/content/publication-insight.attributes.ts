import { createEntityAttributes } from '@genfeedai/helpers';

export const publicationInsightAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'source',
  'platform',
  'description',
  'publicationDate',
  'isCapturedObservation',
  'publicationKind',
  'externalId',
  'url',
  'contextUrl',
  'urlKind',
  'urlIdentity',
  'observedVisibility',
  'credentialId',
  'analyticsAvailability',
  'collectionState',
  'collectionMessage',
  'latestSample',
  'linkCandidates',
]);
