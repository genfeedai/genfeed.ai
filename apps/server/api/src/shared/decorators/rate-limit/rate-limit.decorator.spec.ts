import {
  RATE_LIMIT_KEY,
  RateLimit,
  RateLimitPresets,
} from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { describe, expect, it } from 'vitest';

describe('RateLimitDecorator', () => {
  it('should be defined', () => {
    expect(RateLimit).toBeDefined();
  });

  describe('RATE_LIMIT_KEY', () => {
    it('exports correct metadata key', () => {
      expect(RATE_LIMIT_KEY).toBe('rateLimit');
    });
  });

  describe('RateLimit decorator factory', () => {
    it('returns a function (decorator)', () => {
      const decorator = RateLimit({ limit: 100, windowMs: 60000 });
      expect(typeof decorator).toBe('function');
    });

    it('creates decorator with given options', () => {
      const options = { limit: 50, windowMs: 30000 };
      const decorator = RateLimit(options);
      expect(decorator).toBeDefined();
    });

    it('works with empty options', () => {
      const decorator = RateLimit({});
      expect(decorator).toBeDefined();
    });
  });

  describe('RateLimitPresets', () => {
    it('exports preset configurations', () => {
      expect(RateLimitPresets).toBeDefined();
    });

    it('has standard preset with limit and window', () => {
      expect(RateLimitPresets.standard.limit).toBeGreaterThan(0);
      expect(RateLimitPresets.standard.windowMs).toBeGreaterThan(0);
    });

    it('has strict preset with lower limit than standard', () => {
      expect(RateLimitPresets.strict.limit).toBeLessThan(
        RateLimitPresets.standard.limit,
      );
    });

    it('has auth preset', () => {
      expect(RateLimitPresets.auth).toBeDefined();
      expect(RateLimitPresets.auth.limit).toBeGreaterThan(0);
    });

    it('has relaxed preset with higher limit than standard', () => {
      expect(RateLimitPresets.relaxed.limit).toBeGreaterThan(
        RateLimitPresets.standard.limit,
      );
    });

    it('has external preset', () => {
      expect(RateLimitPresets.external).toBeDefined();
    });

    it('has uploads preset', () => {
      expect(RateLimitPresets.uploads).toBeDefined();
      expect(RateLimitPresets.uploads.limit).toBeGreaterThan(0);
    });

    it('has webhook preset', () => {
      expect(RateLimitPresets.webhook).toBeDefined();
    });

    it('all presets have positive windowMs', () => {
      for (const [, preset] of Object.entries(RateLimitPresets)) {
        expect(preset.windowMs).toBeGreaterThan(0);
      }
    });

    it('all presets have positive limits', () => {
      for (const [, preset] of Object.entries(RateLimitPresets)) {
        expect(preset.limit).toBeGreaterThan(0);
      }
    });
  });
});
