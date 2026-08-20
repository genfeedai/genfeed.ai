import { createEntityAttributes } from '@genfeedai/helpers';

export const folderAttributes = createEntityAttributes([
  'organization',
  'user',
  'brand',
  'parentId',
  'tags',
  'label',
  'description',
  'key',
  'isActive',
]);
