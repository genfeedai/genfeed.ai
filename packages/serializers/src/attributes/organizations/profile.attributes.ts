import { createEntityAttributes } from '@genfeedai/helpers';

export const profileAttributes = createEntityAttributes([
  'organization',
  'createdBy',
  'label',
  'description',
  'image',
  'video',
  'voice',
  'article',
  'tags',
  'isDefault',
  'usageCount',
  'metadata',
]);
