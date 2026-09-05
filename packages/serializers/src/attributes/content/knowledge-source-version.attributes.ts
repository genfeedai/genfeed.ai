import { createEntityAttributes } from '@genfeedai/helpers';

export const knowledgeSourceVersionAttributes = createEntityAttributes([
  'organizationId',
  'sourceId',
  'version',
  'contentHash',
  'provenance',
  'payload',
  'processingState',
  'retrievalState',
  'retentionState',
  'retentionPolicy',
  'observedAt',
  'verifiedAt',
  'expiresAt',
  'purgeScheduledAt',
  'purgedAt',
  'supersededByVersionId',
  'isCurrent',
]);
