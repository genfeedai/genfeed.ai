import type { CredentialPlatform } from '@genfeedai/enums';
import { describe, expect, it, vi } from 'vitest';

const mockLimits = vi.hoisted(() => ({
  instagram: { max: 10, min: 2, name: 'Instagram' },
  tiktok: { max: 35, min: 2, name: 'TikTok' },
}));

vi.mock('@genfeedai/constants', () => ({
  CAROUSEL_LIMITS: mockLimits,
}));

import {
  filterValidPlatforms,
  getCarouselLimits,
  getCarouselMessage,
  platformSupportsCarousel,
  validateCarouselCount,
} from '@utils/carousel-validation';

const instagram = 'instagram' as CredentialPlatform;
const tiktok = 'tiktok' as CredentialPlatform;
const unsupported = 'youtube' as CredentialPlatform;

describe('carousel-validation', () => {
  describe('validateCarouselCount', () => {
    it('returns valid when count is within limits', () => {
      const result = validateCarouselCount([instagram, tiktok], 5);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('returns errors when below minimum', () => {
      const result = validateCarouselCount([instagram], 1);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Instagram requires at least 2 images');
    });

    it('returns errors when above maximum', () => {
      const result = validateCarouselCount([tiktok], 40);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('TikTok allows maximum 35 images');
    });

    it('skips platforms without limits', () => {
      const result = validateCarouselCount([unsupported], 3);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('platformSupportsCarousel', () => {
    it('returns true for supported platforms', () => {
      expect(platformSupportsCarousel(instagram)).toBe(true);
    });

    it('returns false for unsupported platforms', () => {
      expect(platformSupportsCarousel(unsupported)).toBe(false);
    });
  });

  describe('getCarouselLimits', () => {
    it('returns limits for supported platform', () => {
      expect(getCarouselLimits(tiktok)).toEqual(mockLimits.tiktok);
    });

    it('returns undefined for unsupported platform', () => {
      expect(getCarouselLimits(unsupported)).toBeUndefined();
    });
  });

  describe('filterValidPlatforms', () => {
    it('returns platforms that support the count', () => {
      const result = filterValidPlatforms([instagram, tiktok, unsupported], 5);
      expect(result).toEqual([instagram, tiktok]);
    });

    it('filters out platforms outside the count range', () => {
      const result = filterValidPlatforms([instagram, tiktok], 40);
      expect(result).toEqual([]);
    });
  });

  describe('getCarouselMessage', () => {
    it('returns success message when valid', () => {
      const message = getCarouselMessage([instagram], 2);
      expect(message).toBe('✓ 2 images valid for all selected platforms');
    });

    it('uses singular for one image when valid', () => {
      const message = getCarouselMessage([unsupported], 1);
      expect(message).toBe('✓ 1 image valid for all selected platforms');
    });

    it('joins errors when invalid', () => {
      const message = getCarouselMessage([instagram, tiktok], 40);
      expect(message).toBe(
        'Instagram allows maximum 10 images. TikTok allows maximum 35 images',
      );
    });
  });
});
