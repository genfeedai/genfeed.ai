import { CredentialPlatform } from '..';

/**
 * Aspect ratio a platform renders media at in its native feed/composer.
 * Preview renderers use this to size media tiles without an extra fetch.
 */
export type PreviewMediaAspect = '1:1' | '4:5' | '9:16' | '16:9';

export interface PlatformPreviewLimit {
  /** Display name for the platform in preview chrome. */
  name: string;
  /** Maximum caption/character length before the platform truncates it. */
  captionMaxLength: number;
  /** Native media aspect ratio the platform renders at. */
  mediaAspect: PreviewMediaAspect;
}

/**
 * Single source of truth for per-platform caption limits and media aspect
 * used by the post preview renderers (`packages/ui/src/components/previews`).
 * Kept standalone — `@genfeedai/contracts/constants` depends only on `@genfeedai/contracts`,
 * so this intentionally does not import the richer `@genfeedai/contracts/api-types/contracts`
 * `ChannelCapability` catalog used for server-side validation.
 */
export const PLATFORM_PREVIEW_LIMITS: Partial<
  Record<CredentialPlatform, PlatformPreviewLimit>
> = {
  [CredentialPlatform.INSTAGRAM]: {
    captionMaxLength: 2200,
    mediaAspect: '4:5',
    name: 'Instagram',
  },
  [CredentialPlatform.TWITTER]: {
    captionMaxLength: 280,
    mediaAspect: '16:9',
    name: 'X (Twitter)',
  },
  [CredentialPlatform.LINKEDIN]: {
    captionMaxLength: 3000,
    mediaAspect: '1:1',
    name: 'LinkedIn',
  },
  [CredentialPlatform.TIKTOK]: {
    captionMaxLength: 2200,
    mediaAspect: '9:16',
    name: 'TikTok',
  },
  [CredentialPlatform.YOUTUBE]: {
    captionMaxLength: 5000,
    mediaAspect: '16:9',
    name: 'YouTube',
  },
  [CredentialPlatform.THREADS]: {
    captionMaxLength: 500,
    mediaAspect: '1:1',
    name: 'Threads',
  },
};

export function getPlatformPreviewLimit(
  platform: CredentialPlatform | string,
): PlatformPreviewLimit | undefined {
  return PLATFORM_PREVIEW_LIMITS[platform as CredentialPlatform];
}
