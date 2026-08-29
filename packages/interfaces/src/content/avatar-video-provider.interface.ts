export const AVATAR_VIDEO_PROVIDER_NAMES = [
  'argil',
  'genfeedai',
  'heygen',
  'did',
  'tavus',
  'musetalk',
] as const;

export type AvatarVideoProviderName =
  (typeof AVATAR_VIDEO_PROVIDER_NAMES)[number];

export const SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES = [
  'heygen',
  'argil',
  'genfeedai',
] as const;

export type SupportedAvatarVideoProviderName =
  (typeof SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES)[number];

export function isSupportedAvatarVideoProviderName(
  value: string,
): value is SupportedAvatarVideoProviderName {
  return SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES.some(
    (provider) => provider === value,
  );
}
