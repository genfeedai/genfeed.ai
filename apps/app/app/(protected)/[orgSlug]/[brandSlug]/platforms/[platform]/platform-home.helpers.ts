import {
  APP_ROUTES,
  createPlatformHomeRoute,
  createPublishingPostsFilterRoute,
  withPlatformQuery,
} from '@genfeedai/constants';
import {
  formatPlatformLabel,
  isTwitchPlatform,
  isTwitterPlatform,
  isYouTubePlatform,
  Platform,
  parsePlatform,
} from '@genfeedai/enums';
import type {
  PlatformConnectionHealth,
  PlatformHomeConnection,
  PlatformHomeDestinations,
} from '@genfeedai/props/pages/platform-home.props';
import { buildAgentPromptHref } from '@genfeedai/utils/url/desktop-loop-url.util';

export function isSamePlatform(value: unknown, platform: Platform): boolean {
  return parsePlatform(value) === platform;
}

export function filterConnectionsForPlatform(
  connections: readonly PlatformHomeConnection[],
  platform: Platform,
): PlatformHomeConnection[] {
  return connections.filter((connection) =>
    isSamePlatform(connection.platform, platform),
  );
}

export function getPlatformConnectionHealth(
  connection: Pick<PlatformHomeConnection, 'accountHealth'>,
): PlatformConnectionHealth {
  const health = connection.accountHealth;

  if (health?.holdPublishing || health?.riskLevel === 'high') {
    return 'attention';
  }

  if (health?.state === 'healthy' || health?.riskLevel === 'low') {
    return 'healthy';
  }

  return 'connected';
}

export function getPlatformLiveHref(platform: Platform): string | undefined {
  if (isYouTubePlatform(platform) || platform === Platform.RESTREAM) {
    return `${APP_ROUTES.AUTOMATION.LIBRARY}/youtube-chat`;
  }

  if (isTwitchPlatform(platform)) {
    return `${APP_ROUTES.AUTOMATION.LIBRARY}/twitch-chat`;
  }

  return undefined;
}

export function getPlatformRepliesHref(platform: Platform): string | undefined {
  if (isTwitterPlatform(platform) || isYouTubePlatform(platform)) {
    return APP_ROUTES.MESSAGES.REPLIES;
  }

  return undefined;
}

export function buildPlatformCreateHref(platformLabel: string): string {
  return buildAgentPromptHref(
    `Create a new ${platformLabel} post for this brand.`,
  );
}

export function buildPlatformHomeDestinations(
  platform: Platform,
  brandId?: string,
): PlatformHomeDestinations {
  const analytics = brandId
    ? `${APP_ROUTES.ANALYTICS.BRANDS}/${encodeURIComponent(brandId)}/platforms/${encodeURIComponent(platform)}`
    : APP_ROUTES.ANALYTICS.POSTS;

  return {
    analytics,
    calendar: APP_ROUTES.PUBLISHING.CALENDAR,
    create: buildPlatformCreateHref(formatPlatformLabel(platform) ?? platform),
    live: getPlatformLiveHref(platform),
    messages: APP_ROUTES.MESSAGES.ROOT,
    posts: withPlatformQuery(APP_ROUTES.PUBLISHING.POSTS, platform),
    queue: withPlatformQuery(
      createPublishingPostsFilterRoute({ publicationState: 'not-posted' }),
      platform,
    ),
    replies: getPlatformRepliesHref(platform),
    settingsSocial: APP_ROUTES.SETTINGS.SOCIAL,
  };
}

export { createPlatformHomeRoute };
