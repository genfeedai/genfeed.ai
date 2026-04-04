import { createEntityAttributes } from '@genfeedai/helpers';

export const serviceAttributes = createEntityAttributes([
  'brand',
  'code',
  'state',
  'oauthToken',
  'oauthVerifier',
]);
