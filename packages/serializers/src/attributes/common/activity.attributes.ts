import { createEntityAttributes } from '@genfeedai/helpers';

export const activityAttributes = createEntityAttributes([
  'userId',
  'organizationId',
  'brandId',
  'entityModel',
  'entityId',
  'key',
  'value',
  'source',
  'origin',
  'actorUserId',
  'apiKeyId',
  'isRead',
  'totalRequested',
  'totalUpdated',
  'totalFailed',
]);

export const activityBulkPatchAttributes = createEntityAttributes([
  'ids',
  'isRead',
  'isDeleted',
]);
