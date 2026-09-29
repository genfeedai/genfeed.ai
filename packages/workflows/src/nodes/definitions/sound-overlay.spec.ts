import { describe, expect, it } from 'vitest';
import { DEFAULT_SOUND_OVERLAY_DATA } from './sound-overlay';

describe('sound-overlay node', () => {
  describe('DEFAULT_SOUND_OVERLAY_DATA', () => {
    it('should default audioVolume to 100 and videoVolume to 0', () => {
      expect(DEFAULT_SOUND_OVERLAY_DATA.audioVolume).toBe(100);
      expect(DEFAULT_SOUND_OVERLAY_DATA.videoVolume).toBe(0);
    });

    it('should default fadeIn and fadeOut to 0', () => {
      expect(DEFAULT_SOUND_OVERLAY_DATA.fadeIn).toBe(0);
      expect(DEFAULT_SOUND_OVERLAY_DATA.fadeOut).toBe(0);
    });
  });
});
