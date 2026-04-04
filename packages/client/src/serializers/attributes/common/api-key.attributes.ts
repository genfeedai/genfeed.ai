import { createEntityAttributes } from '@genfeedai/helpers';

export const apiKeyFullAttributes = createEntityAttributes([
  'user',
  'organization',

  'key',
  'label',
  'description',
  'token',

  'scopes',
  'lastUsedAt',
  'lastUsedIp',
  'expiresAt',
  'isRevoked',
  'revokedAt',
  'usageCount',
  'rateLimit',
  'allowedIps',
  'metadata',
]);

export const apiKeyAttributes = createEntityAttributes(
  apiKeyFullAttributes.filter((attr: string) => attr !== 'key'),
);
