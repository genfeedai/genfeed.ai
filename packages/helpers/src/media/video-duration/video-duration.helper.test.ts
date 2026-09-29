import { describe, expect, it, vi } from 'vitest';

/**
 * This test validates that the video-duration helpers are exported
 * from the main helpers barrel. Comprehensive unit tests are in
 * packages/helpers/src/video-duration.helper.test.ts
 */

vi.mock('@genfeedai/contracts/constants', async () => {
  const actual = await vi.importActual<
    typeof import('@genfeedai/contracts/constants')
  >('@genfeedai/contracts/constants');
  return {
    ...actual,
    getModelDefaultDuration: vi.fn(() => 8),
    getModelDurations: vi.fn(() => [5, 8, 10]),
  };
});

import { formatDuration } from '@genfeedai/helpers';

describe('video-duration.helper (aliased export smoke tests)', () => {
  describe('formatDuration', () => {
    it('should format null/undefined to 0:00', () => {
      expect(formatDuration(null)).toBe('0:00');
      expect(formatDuration(undefined)).toBe('0:00');
    });
  });
});
