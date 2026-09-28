import { createEntityAttributes } from '@genfeedai/helpers';

export const studioGenerateDraftAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'userId',
  'type',
  'prompt',
  'settingsByType',
  'references',
  'attachments',
  'knowledgeSelection',
  'droppedReferenceIds',
]);
