import { createEntityAttributes } from '@genfeedai/helpers';

export const knowledgeBaseAttributes = createEntityAttributes([
  'label',
  'description',
  'status',
  'scope',
  'organization',
  'brand',
  'user',
  'branding',
  'sources',
  'lastAnalyzedAt',
]);
