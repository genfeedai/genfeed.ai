import { createEntityAttributes } from '@genfeedai/helpers';

export const voteAttributes = createEntityAttributes([
  'user',
  'entityModel',
  'entity',
]);
