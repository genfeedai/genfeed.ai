import { createEntityAttributes } from '@genfeedai/helpers';

export const socialWarmupEnrollmentAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'credentialId',
  'blueprintId',
  'blueprintVersion',
  'startedAt',
  'currentPhaseId',
  'state',
  'enrolledByUserId',
  'events',
  'signals',
  'completedItemIds',
  'reconnect',
  'isCredentialConnected',
  'hasPartialScopes',
]);

export const socialWarmupEventAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'enrollmentId',
  'itemId',
  'provenance',
  'actorUserId',
  'action',
  'occurredAt',
]);

export const socialWarmupSignalAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'enrollmentId',
  'key',
  'observedAt',
  'staleAt',
  'status',
  'source',
  'evidence',
]);
