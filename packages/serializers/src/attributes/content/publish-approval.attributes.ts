import { createEntityAttributes } from '@genfeedai/helpers';

export const publishApprovalAttributes = createEntityAttributes([
  'actorUserId',
  'artifactVersionPinId',
  'brandId',
  'contextVersion',
  'destinations',
  'executedAt',
  'invalidatedAt',
  'invalidationReason',
  'operationId',
  'organizationId',
  'policy',
  'postId',
  'provenance',
  'scheduleIntent',
  'scopeDigest',
  'status',
  'statusTransitions',
]);
