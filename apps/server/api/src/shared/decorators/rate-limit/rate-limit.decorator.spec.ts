import {
  RateLimit,
  RateLimitPresets,
} from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { describe, expect, it } from 'vitest';

describe('RateLimitDecorator', () => {
  describe('RateLimit decorator factory', () => {
    it('returns a function (decorator)', () => {
      const decorator = RateLimit({ limit: 100, windowMs: 60000 });
      expect(typeof decorator).toBe('function');
    });
  });

  describe('RateLimitPresets', () => {
    it('has standard preset with limit and window', () => {
      expect(RateLimitPresets.standard.limit).toBeGreaterThan(0);
      expect(RateLimitPresets.standard.windowMs).toBeGreaterThan(0);
    });

    it('has auth preset', () => {
      expect(RateLimitPresets.auth).toBeDefined();
      expect(RateLimitPresets.auth.limit).toBeGreaterThan(0);
    });

    it('has uploads preset', () => {
      expect(RateLimitPresets.uploads).toBeDefined();
      expect(RateLimitPresets.uploads.limit).toBeGreaterThan(0);
    });
  });
});
