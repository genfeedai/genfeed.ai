import { parseSocialPostUrl, SocialSourcePlatform } from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';

const SOCIAL_SOURCE_PLATFORMS = new Set<string>(
  Object.values(SocialSourcePlatform),
);

/**
 * Profile-URL path prefixes that sit in front of the handle on platforms
 * whose profile URLs are not `/{handle}`.
 */
const PROFILE_PATH_PREFIXES: Readonly<Record<string, ReadonlySet<string>>> = {
  [SocialSourcePlatform.LINKEDIN]: new Set(['in', 'company', 'school']),
  [SocialSourcePlatform.YOUTUBE]: new Set(['c', 'channel', 'user']),
};

/**
 * Non-throwing platform mapper: credential platforms share their wire value
 * with {@link SocialSourcePlatform}; every other platform has no source
 * collector and maps to `undefined`.
 */
export function toSocialSourcePlatform(
  platform: string | null | undefined,
): SocialSourcePlatform | undefined {
  const normalized = platform?.trim().toLowerCase();
  return normalized && SOCIAL_SOURCE_PLATFORMS.has(normalized)
    ? (normalized as SocialSourcePlatform)
    : undefined;
}

export function normalizePlatform(platform: string): SocialSourcePlatform {
  const resolved = toSocialSourcePlatform(platform);
  if (!resolved) {
    throw new BadRequestException(`Unsupported source platform: ${platform}`);
  }
  return resolved;
}

export function normalizeHandle(platform: string, input: string): string {
  const trimmed = input.trim();
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      // Regression guard (#2660): a URL with a post identifier must never
      // silently degrade into following the whole account.
      if (parseSocialPostUrl(trimmed)) {
        throw new BadRequestException(
          'This link points to a specific post — use "Import post" instead, or enter the account handle to follow the account',
        );
      }
      const url = new URL(trimmed);
      const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
      const allowedHosts = getPlatformHosts(platform);
      if (!allowedHosts.includes(hostname)) {
        throw new BadRequestException(
          `Profile URL must use ${allowedHosts.join(' or ')}`,
        );
      }
      const segments = url.pathname.split('/').filter(Boolean);
      const prefixes = PROFILE_PATH_PREFIXES[platform];
      const path =
        prefixes && segments[0] && prefixes.has(segments[0].toLowerCase())
          ? segments[1]
          : segments[0];
      if (!path || path === '@') {
        throw new BadRequestException('Profile URL must include a handle');
      }
      return normalizeHandle(platform, path);
    }
  } catch (error: unknown) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new BadRequestException('Profile URL is invalid');
  }

  const handle = trimmed
    .replace(/^@/, '')
    .replace(/^\/+/, '')
    .trim()
    .toLowerCase();
  if (!handle) {
    throw new BadRequestException('Social source handle is required');
  }
  return handle;
}

export function getPlatformHosts(platform: string): string[] {
  switch (platform) {
    case SocialSourcePlatform.INSTAGRAM:
      return ['instagram.com'];
    case SocialSourcePlatform.TIKTOK:
      return ['tiktok.com'];
    case SocialSourcePlatform.TWITTER:
      return ['x.com', 'twitter.com'];
    case SocialSourcePlatform.YOUTUBE:
      return ['youtube.com', 'm.youtube.com'];
    case SocialSourcePlatform.LINKEDIN:
      return ['linkedin.com'];
    default:
      throw new BadRequestException(`Unsupported source platform: ${platform}`);
  }
}

export function buildProfileUrl(platform: string, handle: string): string {
  const cleanHandle = normalizeHandle(platform, handle);
  switch (platform) {
    case SocialSourcePlatform.INSTAGRAM:
      return `https://www.instagram.com/${cleanHandle}`;
    case SocialSourcePlatform.TIKTOK:
      return `https://www.tiktok.com/@${cleanHandle}`;
    case SocialSourcePlatform.YOUTUBE:
      return `https://www.youtube.com/@${cleanHandle}`;
    case SocialSourcePlatform.LINKEDIN:
      return `https://www.linkedin.com/in/${cleanHandle}`;
    case SocialSourcePlatform.TWITTER:
      return `https://x.com/${cleanHandle}`;
    default:
      throw new BadRequestException(`Unsupported source platform: ${platform}`);
  }
}
