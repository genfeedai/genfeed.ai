import { createEntityAttributes } from '@genfeedai/helpers';

export const runAttributes = createEntityAttributes([
  'traceId',
  'actionType',
  'surface',
  'status',
  'authType',
  'trigger',
  'organization',
  'user',
  'idempotencyKey',
  'correlationId',
  'input',
  'output',
  'metadata',
  'error',
  'progress',
  'startedAt',
  'completedAt',
  'durationMs',
  'events',
]);
