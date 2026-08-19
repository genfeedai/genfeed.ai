import { createEntityAttributes } from '@genfeedai/helpers';

export const postingSetAttributes = createEntityAttributes([
  'organizationId',
  'organization',
  'brandId',
  'brand',
  'userId',
  'user',
  'label',
  'description',
  'isEnabled',
  'targets',
  'validation',
]);

export const postingSignatureAttributes = createEntityAttributes([
  'organizationId',
  'organization',
  'brandId',
  'brand',
  'userId',
  'user',
  'label',
  'body',
  'placement',
  'platforms',
  'isEnabled',
]);
