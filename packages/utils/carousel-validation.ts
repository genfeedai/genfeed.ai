import { CAROUSEL_LIMITS, type CarouselLimit } from '@genfeedai/constants';
import type { CredentialPlatform } from '@genfeedai/enums';

/**
 * Validates if the ingredient count is valid for carousels on the given platforms.
 */
export function validateCarouselCount(
  platforms: CredentialPlatform[],
  count: number,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const platform of platforms) {
    const limits = CAROUSEL_LIMITS[platform];
    if (!limits) {
      continue;
    }

    if (count < limits.min) {
      errors.push(`${limits.name} requires at least ${limits.min} images`);
    }
    if (count > limits.max) {
      errors.push(`${limits.name} allows maximum ${limits.max} images`);
    }
  }

  return { errors, valid: errors.length === 0 };
}

/**
 * Checks if a platform supports carousel posts.
 */
export function platformSupportsCarousel(
  platform: CredentialPlatform,
): boolean {
  return platform in CAROUSEL_LIMITS;
}

/**
 * Gets the carousel limits for a platform.
 */
export function getCarouselLimits(
  platform: CredentialPlatform,
): CarouselLimit | undefined {
  return CAROUSEL_LIMITS[platform];
}

/**
 * Filters platforms that support carousels with the given count.
 */
export function filterValidPlatforms(
  platforms: CredentialPlatform[],
  count: number,
): CredentialPlatform[] {
  return platforms.filter((platform) => {
    const limits = CAROUSEL_LIMITS[platform];
    if (!limits) {
      return false;
    }
    return count >= limits.min && count <= limits.max;
  });
}

/**
 * Gets a user-friendly message about carousel limitations.
 */
export function getCarouselMessage(
  platforms: CredentialPlatform[],
  count: number,
): string {
  const validation = validateCarouselCount(platforms, count);

  if (validation.valid) {
    return `✓ ${count} image${count !== 1 ? 's' : ''} valid for all selected platforms`;
  }

  return validation.errors.join('. ');
}
