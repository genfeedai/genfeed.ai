'use client';

import { CredentialPlatform, IngredientCategory } from '@genfeedai/enums';
import { FaInstagram, FaTiktok, FaXTwitter, FaYoutube } from 'react-icons/fa6';

export const SCHEDULER_ALLOWED_MINUTES: readonly number[] = [0, 15, 30, 45];
export const SCHEDULER_ALLOWED_MINUTES_SET = new Set(SCHEDULER_ALLOWED_MINUTES);

// Platform icon mapping
export const PLATFORM_ICONS = {
  [CredentialPlatform.YOUTUBE]: FaYoutube,
  [CredentialPlatform.INSTAGRAM]: FaInstagram,
  [CredentialPlatform.TWITTER]: FaXTwitter,
  [CredentialPlatform.TIKTOK]: FaTiktok,
};

// All supported platforms
export const ALL_PLATFORMS = [
  CredentialPlatform.YOUTUBE,
  CredentialPlatform.TIKTOK,
  CredentialPlatform.INSTAGRAM,
  CredentialPlatform.TWITTER,
];

// Get available platforms based on content type and carousel mode
export function getAvailablePlatforms(
  category: IngredientCategory,
  isCarousel: boolean,
): CredentialPlatform[] {
  // GIFs only supported on Twitter/X
  if (category === IngredientCategory.GIF) {
    return [CredentialPlatform.TWITTER];
  }

  // Images
  if (category === IngredientCategory.IMAGE) {
    if (isCarousel) {
      return [
        CredentialPlatform.INSTAGRAM,
        CredentialPlatform.TWITTER,
        CredentialPlatform.TIKTOK,
      ];
    }
    return [CredentialPlatform.INSTAGRAM, CredentialPlatform.TWITTER];
  }

  // Videos - YouTube doesn't support carousels
  if (isCarousel) {
    return ALL_PLATFORMS.filter((p) => p !== CredentialPlatform.YOUTUBE);
  }
  return ALL_PLATFORMS;
}

export function getCredentialErrorMessage(
  category: IngredientCategory,
): string {
  switch (category) {
    case IngredientCategory.IMAGE:
      return 'No credentials available for images. Please connect Instagram or Twitter/X to publish images.';
    case IngredientCategory.GIF:
      return 'No credentials available for GIFs. Please connect Twitter/X to publish GIFs.';
    default:
      return 'No credentials available for this content. Please connect a compatible platform.';
  }
}
