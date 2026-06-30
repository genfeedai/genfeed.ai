import { createEntityAttributes } from '@genfeedai/helpers';

const publicFields = [
  'organization',
  'brand',
  'user',
  'tags',
  'platform',
  'externalId',
  'externalHandle',
  'accessTokenExpiry',
  'label',
  'description',
  'isConnected',
];

export const credentialAttributes = createEntityAttributes(publicFields);

export const credentialInstagramAttributes = createEntityAttributes([
  'label',
  'category',
  'username',
  'image',
  'platform',
]);

export const credentialOAuthAttributes = createEntityAttributes(['url']);
