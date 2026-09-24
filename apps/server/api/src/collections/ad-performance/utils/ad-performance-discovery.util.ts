import type { NormalizedPaidCreativeRecord } from '@genfeedai/integrations/ads';

export type SavedDiscoveryCreative = Pick<
  NormalizedPaidCreativeRecord,
  | 'externalAccountId'
  | 'externalAdId'
  | 'adFormat'
  | 'advertiserHandle'
  | 'advertiserName'
  | 'archiveUrl'
  | 'headlineText'
  | 'bodyText'
  | 'imageUrls'
  | 'videoUrls'
  | 'creativeMediaUrls'
  | 'creativeType'
  | 'fundingEntity'
  | 'isHalted'
  | 'landingPageUrl'
  | 'presentationEndDate'
  | 'presentationStartDate'
  | 'reachEstimateMax'
  | 'reachEstimateMin'
  | 'targetingCountries'
  | 'targetingCriteria'
>;

function savedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
function savedStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
export function savedDiscoveryUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
function savedUrls(value: unknown): string[] {
  return [
    ...new Set(
      savedStrings(value).flatMap((value) =>
        savedDiscoveryUrl(value) ? [value] : [],
      ),
    ),
  ];
}
export function projectSavedDiscoveryCreative(
  row: Record<string, unknown>,
): SavedDiscoveryCreative {
  return {
    externalAccountId: savedString(row.externalAccountId) ?? '',
    externalAdId: savedString(row.externalAdId),
    adFormat: savedString(row.adFormat),
    advertiserHandle: savedString(row.advertiserHandle),
    advertiserName: savedString(row.advertiserName),
    archiveUrl: savedDiscoveryUrl(row.archiveUrl),
    headlineText: savedString(row.headlineText),
    bodyText: savedString(row.bodyText),
    imageUrls: savedUrls(row.imageUrls),
    videoUrls: savedUrls(row.videoUrls),
    creativeMediaUrls: savedUrls(row.creativeMediaUrls),
    creativeType:
      row.creativeType === 'video'
        ? 'video'
        : row.creativeType === 'image'
          ? 'image'
          : undefined,
    fundingEntity: savedString(row.fundingEntity),
    isHalted: typeof row.isHalted === 'boolean' ? row.isHalted : undefined,
    landingPageUrl: savedDiscoveryUrl(row.landingPageUrl),
    presentationStartDate: savedString(row.presentationStartDate),
    presentationEndDate: savedString(row.presentationEndDate),
    reachEstimateMax:
      typeof row.reachEstimateMax === 'number' &&
      Number.isFinite(row.reachEstimateMax) &&
      row.reachEstimateMax >= 0
        ? row.reachEstimateMax
        : undefined,
    reachEstimateMin:
      typeof row.reachEstimateMin === 'number' &&
      Number.isFinite(row.reachEstimateMin) &&
      row.reachEstimateMin >= 0
        ? row.reachEstimateMin
        : undefined,
    targetingCountries: savedStrings(row.targetingCountries),
    targetingCriteria: savedStrings(row.targetingCriteria),
  };
}
export function savedDiscoveryMediaType(
  row: SavedDiscoveryCreative,
): 'image' | 'video' | undefined {
  if (row.adFormat?.toLowerCase() === 'text') return undefined;
  if (
    row.videoUrls?.length ||
    (row.creativeType === 'video' && row.imageUrls?.length)
  )
    return 'video';
  return row.imageUrls?.length ? 'image' : undefined;
}
export function savedHostname(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.hostname.toLowerCase()
      : undefined;
  } catch {
    return undefined;
  }
}
