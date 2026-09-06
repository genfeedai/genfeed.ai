import { parseSocialPostUrl, SocialSourcePlatform } from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';

/**
 * Non-throwing platform mapper: credential platforms (`instagram`, `tiktok`,
 * `twitter`) share their wire value with {@link SocialSourcePlatform}; every
 * other platform has no source collector yet and maps to `undefined`.
 */
export function toSocialSourcePlatform(
  platform: string | null | undefined,
): SocialSourcePlatform | undefined {
  const normalized = platform?.trim().toLowerCase();
  if (
    normalized === SocialSourcePlatform.TWITTER ||
    normalized === SocialSourcePlatform.INSTAGRAM ||
    normalized === SocialSourcePlatform.TIKTOK
  ) {
    return normalized;
  }
  return undefined;
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
      const path = url.pathname.split('/').find(Boolean);
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
    default:
      return `https://x.com/${cleanHandle}`;
  }
}
