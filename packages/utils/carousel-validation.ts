import type { CredentialPlatform } from '@genfeedai/contracts';
import { getChannelCapability } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';

export interface CarouselLimit {
  min: number;
  max: number;
  name: string;
}

/**
 * Photo-carousel limits of a channel, read from the channel capability
 * catalog (the single source of truth). A channel that takes one image at
 * most has no carousel.
 */
function carouselLimitsFor(
  platform: CredentialPlatform,
): CarouselLimit | undefined {
  const capability = getChannelCapability(platform);
  const images = capability?.media.images;
  if (!capability || !images || images.maxItems < 2) {
    return undefined;
  }

  return {
    max: images.maxItems,
    min: Math.max(2, images.minItems),
    name: capability.label,
  };
}

/**
 * Validates if the ingredient count is valid for carousels on the given platforms.
 */
export function validateCarouselCount(
  platforms: CredentialPlatform[],
  count: number,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const platform of platforms) {
    const limits = carouselLimitsFor(platform);
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
  return carouselLimitsFor(platform) !== undefined;
}

/**
 * Gets the carousel limits for a platform.
 */
export function getCarouselLimits(
  platform: CredentialPlatform,
): CarouselLimit | undefined {
  return carouselLimitsFor(platform);
}

/**
 * Filters platforms that support carousels with the given count.
 */
export function filterValidPlatforms(
  platforms: CredentialPlatform[],
  count: number,
): CredentialPlatform[] {
  return platforms.filter((platform) => {
    const limits = carouselLimitsFor(platform);
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
