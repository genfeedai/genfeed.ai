import { MusicSourceType } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MUSIC_SOURCE_DATA,
  musicSourceNodeDefinition,
} from './music-source';

describe('music-source node', () => {
  describe('DEFAULT_MUSIC_SOURCE_DATA', () => {
    it('should have label set to Music Source', () => {
      expect(DEFAULT_MUSIC_SOURCE_DATA.label).toBe('Music Source');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_MUSIC_SOURCE_DATA.status).toBe('idle');
    });

    it('should default sourceType to LIBRARY', () => {
      expect(DEFAULT_MUSIC_SOURCE_DATA.sourceType).toBe(
        MusicSourceType.LIBRARY,
      );
    });

    it('should default trendMinUsage to 10000', () => {
      expect(DEFAULT_MUSIC_SOURCE_DATA.trendMinUsage).toBe(10000);
    });

    it('should default generateDuration to 30', () => {
      expect(DEFAULT_MUSIC_SOURCE_DATA.generateDuration).toBe(30);
    });

    it('should default all nullable fields to null', () => {
      expect(DEFAULT_MUSIC_SOURCE_DATA.trendPlatform).toBeNull();
      expect(DEFAULT_MUSIC_SOURCE_DATA.libraryCategory).toBeNull();
      expect(DEFAULT_MUSIC_SOURCE_DATA.libraryMood).toBeNull();
      expect(DEFAULT_MUSIC_SOURCE_DATA.uploadUrl).toBeNull();
      expect(DEFAULT_MUSIC_SOURCE_DATA.generatePrompt).toBeNull();
      expect(DEFAULT_MUSIC_SOURCE_DATA.musicUrl).toBeNull();
      expect(DEFAULT_MUSIC_SOURCE_DATA.duration).toBeNull();
      expect(DEFAULT_MUSIC_SOURCE_DATA.tempo).toBeNull();
      expect(DEFAULT_MUSIC_SOURCE_DATA.title).toBeNull();
      expect(DEFAULT_MUSIC_SOURCE_DATA.artist).toBeNull();
      expect(DEFAULT_MUSIC_SOURCE_DATA.coverUrl).toBeNull();
    });
  });

  describe('musicSourceNodeDefinition', () => {
    it('should have type musicSource', () => {
      expect(musicSourceNodeDefinition.type).toBe('musicSource');
    });

    it('should be in input category', () => {
      expect(musicSourceNodeDefinition.category).toBe('input');
    });

    it('should have label Music Source', () => {
      expect(musicSourceNodeDefinition.label).toBe('Music Source');
    });

    it('should have optional inputs for uploadUrl and generatePrompt', () => {
      const upload = musicSourceNodeDefinition.inputs.find(
        (i) => i.id === 'uploadUrl',
      );
      const prompt = musicSourceNodeDefinition.inputs.find(
        (i) => i.id === 'generatePrompt',
      );
      expect(upload?.required).toBe(false);
      expect(prompt?.required).toBe(false);
    });

    it('should output musicUrl, duration, tempo, and title', () => {
      const outputIds = musicSourceNodeDefinition.outputs.map((o) => o.id);
      expect(outputIds).toEqual(['musicUrl', 'duration', 'tempo', 'title']);
    });

    it('should reference default data', () => {
      expect(musicSourceNodeDefinition.defaultData).toBe(
        DEFAULT_MUSIC_SOURCE_DATA,
      );
    });
  });
});
