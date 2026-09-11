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

/**
 * True when a provider grant was persisted (a token exists) but never
 * resolved to a specific account (no `externalId`) and so was never marked
 * connected — the shape `InstagramController.resolveAuthorizedAccount`
 * leaves behind when several eligible accounts are equally plausible. It is
 * computed here, from persisted columns, rather than left for a caller to
 * infer from `isConnected` alone: `isConnected` can also be `false` for
 * other reasons (a lapsed token, a never-completed OAuth attempt), none of
 * which have an operator selection waiting to be made. `externalId` already
 * being absent is what makes this reliable even if a later step (e.g. a
 * signal refresh) flips `isConnected` back to false on an otherwise-resolved
 * row — that row keeps its `externalId` and this stays `false`.
 *
 * Runs after the `platform` transform, so `record.platform` here is already
 * the lowercase domain value.
 */
export function computeNeedsAccountSelection(
  record: Record<string, unknown>,
): boolean {
  return (
    record.isConnected === false &&
    Boolean(record.accessToken) &&
    !record.externalId
  );
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
  'needsAccountSelection',
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
