import { CredentialPlatform, TargetAnalyticsCapability } from '../..';
import type { SchedulerAnalyticsCapability } from '../../interfaces';

const HOUR_MS = 60 * 60 * 1000;

const SUPPORTED_ANALYTICS_CAPABILITIES: Partial<
  Record<CredentialPlatform, SchedulerAnalyticsCapability>
> = {
  [CredentialPlatform.FACEBOOK]: {
    freshnessWindowMs: 2 * HOUR_MS,
    status: TargetAnalyticsCapability.SUPPORTED,
  },
  [CredentialPlatform.INSTAGRAM]: {
    freshnessWindowMs: 2 * HOUR_MS,
    status: TargetAnalyticsCapability.SUPPORTED,
  },
  [CredentialPlatform.LINKEDIN]: {
    freshnessWindowMs: 2 * HOUR_MS,
    status: TargetAnalyticsCapability.SUPPORTED,
  },
  [CredentialPlatform.MASTODON]: {
    freshnessWindowMs: 2 * HOUR_MS,
    status: TargetAnalyticsCapability.SUPPORTED,
  },
  [CredentialPlatform.PINTEREST]: {
    freshnessWindowMs: 2 * HOUR_MS,
    status: TargetAnalyticsCapability.SUPPORTED,
  },
  [CredentialPlatform.THREADS]: {
    freshnessWindowMs: 2 * HOUR_MS,
    status: TargetAnalyticsCapability.SUPPORTED,
  },
  [CredentialPlatform.TIKTOK]: {
    freshnessWindowMs: 2 * HOUR_MS,
    status: TargetAnalyticsCapability.SUPPORTED,
  },
  [CredentialPlatform.TWITTER]: {
    freshnessWindowMs: HOUR_MS,
    status: TargetAnalyticsCapability.SUPPORTED,
  },
  [CredentialPlatform.YOUTUBE]: {
    freshnessWindowMs: 2 * HOUR_MS,
    status: TargetAnalyticsCapability.SUPPORTED,
  },
};

const UNSUPPORTED_ANALYTICS_CAPABILITY: SchedulerAnalyticsCapability = {
  freshnessWindowMs: null,
  status: TargetAnalyticsCapability.UNSUPPORTED,
};

export function getSchedulerAnalyticsCapability(
  platform: CredentialPlatform | string,
): SchedulerAnalyticsCapability {
  const normalizedPlatform = String(
    platform,
  ).toLowerCase() as CredentialPlatform;
  const capability = SUPPORTED_ANALYTICS_CAPABILITIES[normalizedPlatform];

  return capability
    ? { ...capability }
    : { ...UNSUPPORTED_ANALYTICS_CAPABILITY };
}
