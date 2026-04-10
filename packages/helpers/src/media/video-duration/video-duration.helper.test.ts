import { describe, expect, it, vi } from 'vitest';

/**
 * This test validates that the video-duration helpers are exported
 * from the main helpers barrel. Comprehensive unit tests are in
 * packages/helpers/__tests__/video-duration.helper.test.ts
 */

vi.mock('@genfeedai/constants', async () => {
  const actual = await vi.importActual<typeof import('@genfeedai/constants')>(
    '@genfeedai/constants',
  );
  return {
    ...actual,
    getModelDefaultDuration: vi.fn(() => 8),
    getModelDurations: vi.fn(() => [5, 8, 10]),
  };
});

import { DurationUtil, formatDuration } from '@genfeedai/helpers';

describe('video-duration.helper (aliased export smoke tests)', () => {
  describe('formatDuration', () => {
    it('should be exported and callable', () => {
      expect(typeof formatDuration).toBe('function');
    });

    it('should format 0 seconds', () => {
      expect(formatDuration(0)).toBe('0:00');
    });

    it('should format null/undefined to 0:00', () => {
      expect(formatDuration(null)).toBe('0:00');
      expect(formatDuration(undefined)).toBe('0:00');
    });

    it('should format seconds correctly', () => {
      expect(formatDuration(65)).toBe('1:05');
    });

    it('should format hours correctly', () => {
      expect(formatDuration(3661)).toBe('1:01:01');
    });
  });

  describe('DurationUtil', () => {
    it('should be exported', () => {
      expect(DurationUtil).toBeDefined();
    });

    it('validateAndNormalize should snap to nearest allowed value', () => {
      expect(DurationUtil.validateAndNormalize(7, [5, 8, 10])).toBe(8);
    });

    it('validateAndNormalize should return default when no duration requested', () => {
      expect(DurationUtil.validateAndNormalize(undefined, [5, 8], 8)).toBe(8);
    });
  });
});
