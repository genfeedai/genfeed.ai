import { Platform } from '../enums/platform.enum';

export const AVATAR_VIDEO_ASPECT_RATIOS = ['9:16', '16:9', '1:1'] as const;
export type AvatarVideoAspectRatio =
  (typeof AVATAR_VIDEO_ASPECT_RATIOS)[number];

/** Avatar videos are talking-head clips, so they default to portrait. */
export const DEFAULT_AVATAR_VIDEO_ASPECT_RATIO: AvatarVideoAspectRatio = '9:16';

const PLATFORM_AVATAR_VIDEO_ASPECT_RATIOS: Readonly<
  Partial<Record<Platform, AvatarVideoAspectRatio>>
> = {
  [Platform.FACEBOOK]: '1:1',
  [Platform.INSTAGRAM]: '9:16',
  [Platform.LINKEDIN]: '1:1',
  [Platform.PINTEREST]: '9:16',
  [Platform.SNAPCHAT]: '9:16',
  [Platform.THREADS]: '9:16',
  [Platform.TIKTOK]: '9:16',
  [Platform.TWITTER]: '16:9',
  [Platform.YOUTUBE]: '16:9',
};

export function isAvatarVideoAspectRatio(
  value: unknown,
): value is AvatarVideoAspectRatio {
  return AVATAR_VIDEO_ASPECT_RATIOS.some((ratio) => ratio === value);
}

/**
 * Picks the avatar video format: an explicit aspect ratio wins, then the
 * target platform's native format, then portrait. Short-form placements
 * (Reels, Shorts, TikTok, Stories) are portrait, so an unknown platform also
 * lands on portrait instead of the landscape default.
 */
export function resolveAvatarVideoAspectRatio(input: {
  aspectRatio?: unknown;
  platform?: unknown;
}): AvatarVideoAspectRatio {
  if (isAvatarVideoAspectRatio(input.aspectRatio)) {
    return input.aspectRatio;
  }

  const platform =
    typeof input.platform === 'string'
      ? input.platform.trim().toLowerCase()
      : '';
  const shortForm = /reel|short|story|stories|tiktok/.test(platform);
  if (shortForm) {
    return '9:16';
  }

  return (
    PLATFORM_AVATAR_VIDEO_ASPECT_RATIOS[platform as Platform] ??
    DEFAULT_AVATAR_VIDEO_ASPECT_RATIO
  );
}
