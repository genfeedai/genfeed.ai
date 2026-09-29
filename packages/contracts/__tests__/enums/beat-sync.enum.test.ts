import { describe, expect, it } from 'vitest';
import {
  BeatSensitivity,
  BeatSyncCutStrategy,
  BeatSyncTransitionType,
  MusicSourceType,
} from '../../src/enums/beat-sync.enum';

describe('beat-sync.enum', () => {
  describe('BeatSyncCutStrategy', () => {
    it('should have correct values', () => {
      expect(BeatSyncCutStrategy.EVERY_BEAT).toBe('everyBeat');
      expect(BeatSyncCutStrategy.EVERY_OTHER_BEAT).toBe('everyOtherBeat');
      expect(BeatSyncCutStrategy.DOWNBEATS_ONLY).toBe('downbeatsOnly');
      expect(BeatSyncCutStrategy.CUSTOM).toBe('custom');
    });
  });

  describe('BeatSyncTransitionType', () => {
    it('should have correct values', () => {
      expect(BeatSyncTransitionType.CUT).toBe('cut');
      expect(BeatSyncTransitionType.CROSSFADE).toBe('crossfade');
      expect(BeatSyncTransitionType.FLASH).toBe('flash');
      expect(BeatSyncTransitionType.ZOOM).toBe('zoom');
    });
  });

  describe('MusicSourceType', () => {
    it('should have correct values', () => {
      expect(MusicSourceType.TREND_SOUND).toBe('trendSound');
      expect(MusicSourceType.LIBRARY).toBe('library');
      expect(MusicSourceType.UPLOAD).toBe('upload');
      expect(MusicSourceType.GENERATE).toBe('generate');
    });
  });

  describe('BeatSensitivity', () => {
    it('should have correct values', () => {
      expect(BeatSensitivity.LOW).toBe('low');
      expect(BeatSensitivity.MEDIUM).toBe('medium');
      expect(BeatSensitivity.HIGH).toBe('high');
    });
  });
});
