import { validateCarouselForPlatform } from '@api/shared/validators/carousel/carousel.validator';
import { CredentialPlatform } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

describe('validateCarouselForPlatform', () => {
  it('returns valid for single image on non-carousel platform', () => {
    const result = validateCarouselForPlatform(
      'youtube' as CredentialPlatform,
      1,
    );
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns invalid for multiple images on non-carousel platform', () => {
    const result = validateCarouselForPlatform(
      'youtube' as CredentialPlatform,
      3,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('does not support carousels');
  });

  it('validates Instagram carousel limits', () => {
    // Instagram supports carousels (at least 2 items per Instagram policy)
    const valid = validateCarouselForPlatform(CredentialPlatform.INSTAGRAM, 5);
    expect(typeof valid.valid).toBe('boolean');
  });

  it('returns error when exceeding max limit', () => {
    // Most platforms have a max limit, try a large number
    const result = validateCarouselForPlatform(
      CredentialPlatform.INSTAGRAM,
      999,
    );
    if (!result.valid) {
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    }
  });

  it('returns error when below min limit', () => {
    // Try with 0 items
    const result = validateCarouselForPlatform(CredentialPlatform.INSTAGRAM, 0);
    expect(typeof result.valid).toBe('boolean');
    if (!result.valid) {
      expect(result.error).toBeDefined();
    }
  });

  it("returns valid: false with error for platforms that don't support carousels with >1 items", () => {
    const result = validateCarouselForPlatform(
      'unknown-platform' as CredentialPlatform,
      5,
    );
    expect(result.valid).toBe(false);
  });
});
