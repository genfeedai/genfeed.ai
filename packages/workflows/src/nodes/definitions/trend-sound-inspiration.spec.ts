import { describe, expect, it } from 'vitest';
import { DEFAULT_TREND_SOUND_INSPIRATION_DATA } from './trend-sound-inspiration';

describe('trend-sound-inspiration node', () => {
  describe('DEFAULT_TREND_SOUND_INSPIRATION_DATA', () => {
    it('should have label set to Trend Sound Inspiration', () => {
      expect(DEFAULT_TREND_SOUND_INSPIRATION_DATA.label).toBe(
        'Trend Sound Inspiration',
      );
    });

    it('should default to idle status', () => {
      expect(DEFAULT_TREND_SOUND_INSPIRATION_DATA.status).toBe('idle');
    });

    it('should default minUsageCount to 10000', () => {
      expect(DEFAULT_TREND_SOUND_INSPIRATION_DATA.minUsageCount).toBe(10000);
    });
  });
});
