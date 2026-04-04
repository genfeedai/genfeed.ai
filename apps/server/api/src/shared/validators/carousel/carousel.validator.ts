import { CAROUSEL_LIMITS, type CarouselLimit } from '@genfeedai/constants';
import type { CredentialPlatform } from '@genfeedai/enums';

/**
 * Validates if the ingredient count is valid for a carousel on the given platform
 * @param platform The social media platform
 * @param ingredientCount Number of ingredients/images in the carousel
 * @returns Object with validation result and optional error message
 */
export function validateCarouselForPlatform(
  platform: CredentialPlatform,
  ingredientCount: number,
): { valid: boolean; error?: string } {
  const limits = CAROUSEL_LIMITS[platform];

  // If platform doesn't have carousel limits, it doesn't support carousels
  if (!limits) {
    return {
      error:
        ingredientCount > 1
          ? `${platform} does not support carousels`
          : undefined,
      valid: ingredientCount === 1,
    };
  }

  // Check minimum
  if (ingredientCount < limits.min) {
    return {
      error: `${limits.name} requires at least ${limits.min} images for carousel`,
      valid: false,
    };
  }

  // Check maximum
  if (ingredientCount > limits.max) {
    return {
      error: `${limits.name} allows maximum ${limits.max} images for carousel`,
      valid: false,
    };
  }

  return { valid: true };
}

/**
 * Checks if a platform supports carousel posts
 * @param platform The social media platform
 * @returns true if platform supports carousels
 */
export function platformSupportsCarousel(
  platform: CredentialPlatform,
): boolean {
  return platform in CAROUSEL_LIMITS;
}

/**
 * Gets the carousel limits for a platform
 * @param platform The social media platform
 * @returns Carousel limits or undefined if not supported
 */
export function getCarouselLimits(
  platform: CredentialPlatform,
): CarouselLimit | undefined {
  return CAROUSEL_LIMITS[platform];
}
