import { createEntityAttributes } from '@genfeedai/helpers';

export const serviceAttributes = createEntityAttributes([
  'brandId',
  'code',
  'state',
  'oauthToken',
  'oauthVerifier',
]);
