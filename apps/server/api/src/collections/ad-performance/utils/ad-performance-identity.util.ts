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

const readString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

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
  adPlatform: readString(data.adPlatform),
  date: readAdPerformanceDate(data.date),
  externalAccountId: readString(data.externalAccountId),
  externalAdId: readString(data.externalAdId),
  externalAdSetId:
    readString(data.externalAdSetId) ?? readString(data.externalAdGroupId),
  externalCampaignId: readString(data.externalCampaignId),
  granularity: readString(data.granularity),
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
  const researchSource = readString(data.researchSource);
  if (!researchSource) {
    return buildAdPerformanceIdentityKey(identity);
  }

  return [
    AD_PERFORMANCE_IDENTITY_KEY_VERSION,
    'research',
    researchSource,
    readString(data.brandId) ?? '__organization__',
    readString(data.researchSnapshotKey) ?? '',
    identity.adPlatform ?? '',
    identity.date ? identity.date.toISOString() : '',
    identity.granularity ?? '',
    identity.externalAccountId ?? '',
    identity.externalCampaignId ?? '',
    identity.externalAdSetId ?? '',
    identity.externalAdId ?? '',
  ].join('|');
};
