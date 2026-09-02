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

    it('should default maxDuration to null', () => {
      expect(DEFAULT_TREND_SOUND_INSPIRATION_DATA.maxDuration).toBeNull();
    });

    it('should default all output fields to null', () => {
      expect(DEFAULT_TREND_SOUND_INSPIRATION_DATA.soundId).toBeNull();
      expect(DEFAULT_TREND_SOUND_INSPIRATION_DATA.soundName).toBeNull();
      expect(DEFAULT_TREND_SOUND_INSPIRATION_DATA.soundUrl).toBeNull();
      expect(DEFAULT_TREND_SOUND_INSPIRATION_DATA.duration).toBeNull();
      expect(DEFAULT_TREND_SOUND_INSPIRATION_DATA.usageCount).toBeNull();
    });

    it('should default display info fields to null', () => {
      expect(DEFAULT_TREND_SOUND_INSPIRATION_DATA.authorName).toBeNull();
      expect(DEFAULT_TREND_SOUND_INSPIRATION_DATA.coverUrl).toBeNull();
      expect(DEFAULT_TREND_SOUND_INSPIRATION_DATA.growthRate).toBeNull();
    });
  });
});
