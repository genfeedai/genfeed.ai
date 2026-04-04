import { createEntityAttributes } from '@genfeedai/helpers';

export const activityAttributes = createEntityAttributes([
  'user',
  'organization',
  'brand',
  'entityModel',
  'entityId',
  'key',
  'value',
  'source',
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
