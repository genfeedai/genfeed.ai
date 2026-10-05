import { readNonEmptyStringOrNull } from '@genfeedai/utils/data/extract.util';

export const AD_PERFORMANCE_IDENTITY_KEY_VERSION = 'v1';

export type AdPerformanceIdentityFields = {
  adPlatform: string | null;
  date: Date | null;
  externalAccountId: string | null;
  externalAdId: string | null;
  externalAdSetId: string | null;
  externalCampaignId: string | null;
  granularity: string | null;
};

export const readAdPerformanceDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 1e12 ? value : value * 1000;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'string' && value.length > 0) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
};

export const resolveAdPerformanceIdentityFields = (
  data: Record<string, unknown>,
): AdPerformanceIdentityFields => ({
  adPlatform: readNonEmptyStringOrNull(data.adPlatform),
  date: readAdPerformanceDate(data.date),
  externalAccountId: readNonEmptyStringOrNull(data.externalAccountId),
  externalAdId: readNonEmptyStringOrNull(data.externalAdId),
  externalAdSetId:
    readNonEmptyStringOrNull(data.externalAdSetId) ??
    readNonEmptyStringOrNull(data.externalAdGroupId),
  externalCampaignId: readNonEmptyStringOrNull(data.externalCampaignId),
  granularity: readNonEmptyStringOrNull(data.granularity),
});

export const buildAdPerformanceIdentityKey = (
  fields: AdPerformanceIdentityFields,
): string =>
  [
    AD_PERFORMANCE_IDENTITY_KEY_VERSION,
    fields.adPlatform ?? '',
    fields.date ? fields.date.toISOString() : '',
    fields.granularity ?? '',
    fields.externalAccountId ?? '',
    fields.externalCampaignId ?? '',
    fields.externalAdSetId ?? '',
    fields.externalAdId ?? '',
  ].join('|');

export const buildAdPerformanceIdentityKeyFromData = (
  data: Record<string, unknown>,
): string => {
  const identity = resolveAdPerformanceIdentityFields(data);
  const researchSource = readNonEmptyStringOrNull(data.researchSource);
  if (!researchSource) {
    return buildAdPerformanceIdentityKey(identity);
  }

  return [
    AD_PERFORMANCE_IDENTITY_KEY_VERSION,
    'research',
    researchSource,
    readNonEmptyStringOrNull(data.brandId) ?? '__organization__',
    readNonEmptyStringOrNull(data.researchSnapshotKey) ?? '',
    identity.adPlatform ?? '',
    identity.date ? identity.date.toISOString() : '',
    identity.granularity ?? '',
    identity.externalAccountId ?? '',
    identity.externalCampaignId ?? '',
    identity.externalAdSetId ?? '',
    identity.externalAdId ?? '',
  ].join('|');
};
