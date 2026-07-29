import {
  isPrismaUniqueConstraintError,
  isSlugUniqueConstraintError,
  nextSlugCandidate,
  slugAllocationBase,
} from '@api/collections/shared/slug-allocation.util';

describe('slug-allocation.util', () => {
  describe('isPrismaUniqueConstraintError', () => {
    it('detects P2002', () => {
      expect(isPrismaUniqueConstraintError({ code: 'P2002' })).toBe(true);
      expect(isPrismaUniqueConstraintError({ code: 'P2025' })).toBe(false);
      expect(isPrismaUniqueConstraintError(null)).toBe(false);
    });
  });

  describe('isSlugUniqueConstraintError', () => {
    it('accepts slug targets and unknown targets', () => {
      expect(
        isSlugUniqueConstraintError({
          code: 'P2002',
          meta: { target: ['slug'] },
        }),
      ).toBe(true);
      expect(
        isSlugUniqueConstraintError({
          code: 'P2002',
          meta: { target: 'brands_slug_key' },
        }),
      ).toBe(true);
      expect(isSlugUniqueConstraintError({ code: 'P2002' })).toBe(true);
    });

    it('rejects non-slug unique targets', () => {
      expect(
        isSlugUniqueConstraintError({
          code: 'P2002',
          meta: { target: ['email'] },
        }),
      ).toBe(false);
    });
  });

  describe('nextSlugCandidate', () => {
    it('returns base then base-2, base-3…', () => {
      expect(nextSlugCandidate('acme', 0)).toBe('acme');
      expect(nextSlugCandidate('acme', 1)).toBe('acme-2');
      expect(nextSlugCandidate('acme', 2)).toBe('acme-3');
    });
  });

  describe('slugAllocationBase', () => {
    it('peels trailing allocator suffixes', () => {
      expect(slugAllocationBase('acme')).toBe('acme');
      expect(slugAllocationBase('acme-2')).toBe('acme');
      expect(slugAllocationBase('acme-studio')).toBe('acme-studio');
    });
  });
});
