/**
 * Clip Factory queue contract.
 *
 * Isolated queue so the clip-factory workload can be moved to a dedicated
 * worker instance without code changes.
 */
export const AVATAR_VIDEO_PROVIDER_NAMES = [
  'heygen',
  'did',
  'tavus',
  'musetalk',
] as const;

export type AvatarVideoProviderName =
  (typeof AVATAR_VIDEO_PROVIDER_NAMES)[number];

export const SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES = ['heygen'] as const;

export type SupportedAvatarVideoProviderName =
  (typeof SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES)[number];

export function isSupportedAvatarVideoProviderName(
  value: string,
): value is SupportedAvatarVideoProviderName {
  return SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES.some(
    (provider) => provider === value,
  );
}

export const CLIP_FACTORY_JOB_NAME = 'clip-factory-run';

/** Default concurrency — one long-running pipeline per worker. */
export const CLIP_FACTORY_CONCURRENCY = 2;

export interface ClipFactoryJobData {
  projectId: string;
  youtubeUrl: string;
  avatarId: string;
  voiceId: string;
  avatarProvider: SupportedAvatarVideoProviderName;
  maxClips: number;
  minViralityScore: number;
  language: string;
  orgId: string;
  userId: string;
}
