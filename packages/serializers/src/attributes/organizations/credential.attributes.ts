import { fromPrismaCredentialPlatform } from '@genfeedai/contracts';
import { createEntityAttributes } from '@genfeedai/helpers';

/**
 * Prisma `credentials.platform` is SCREAMING; API JSON stays domain lowercase.
 * Serializer configs register this under `attributeTransforms.platform` so
 * the wire value is normalized before ts-jsonapi reads listed attributes.
 */
export function mapSerializedCredentialPlatform(record: {
  platform?: unknown;
}): string | undefined {
  if (typeof record.platform !== 'string' || record.platform.length === 0) {
    return undefined;
  }

  const mapped = fromPrismaCredentialPlatform(record.platform);
  if (!mapped) {
    throw new Error(`Unknown credential platform: ${record.platform}`);
  }

  return mapped;
}

const publicFields = [
  'organizationId',
  'brandId',
  'userId',
  'platform',
  'externalId',
  'externalHandle',
  'externalName',
  'externalAvatar',
  'accessTokenExpiry',
  'label',
  'description',
  'postingTimes',
  'accountHealth',
  'warmupAssessedAt',
  'warmupHoldReason',
  'warmupManualOverride',
  'warmupOverrideConfirmedAt',
  'warmupOverrideConfirmedByUserId',
  'warmupOverrideReason',
  'warmupOverrideUntil',
  'warmupRiskLevel',
  'warmupScore',
  'warmupSignals',
  'warmupState',
  'warmupThresholds',
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
