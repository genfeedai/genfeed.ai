import type {
  TrendSourceClassification,
  TrendSourceReferenceRecord,
} from '@api/collections/trends/interfaces/trend.interfaces';

export function hasPromptReadyIdentity(reference: {
  canonicalUrl: string;
  contentType: string;
  platform: string;
}): boolean {
  return (
    reference.canonicalUrl.length > 0 &&
    reference.platform.length > 0 &&
    reference.contentType.length > 0
  );
}

export function isTrendPromptReady(
  reference: TrendSourceReferenceRecord,
  contentIntent: TrendSourceClassification['intendedUse'],
  label: string,
): boolean {
  const matchesIntent =
    reference.sourceClassification?.intendedUse === contentIntent;
  const hasFiniteEngagement = Number.isFinite(reference.currentEngagementTotal);

  return (
    matchesIntent &&
    hasPromptReadyIdentity(reference) &&
    hasFiniteEngagement &&
    label.length > 0
  );
}
