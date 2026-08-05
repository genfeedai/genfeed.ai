import { createEntityAttributes } from '@genfeedai/helpers';

export const evaluationAttributes = createEntityAttributes([
  'organizationId',
  'userId',
  'contentType',
  'contentId',
  'data',
]);
