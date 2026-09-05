import { createEntityAttributes } from '@genfeedai/helpers';

export const knowledgeSourceAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'userId',
  'scope',
  'title',
  'kind',
  'purpose',
  'isVisible',
]);
