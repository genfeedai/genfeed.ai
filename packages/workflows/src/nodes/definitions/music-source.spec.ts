import { describe, expect, it } from 'vitest';
import { DEFAULT_MUSIC_SOURCE_DATA } from './music-source';

describe('music-source node', () => {
  describe('DEFAULT_MUSIC_SOURCE_DATA', () => {
    it('should default generateDuration to 30', () => {
      expect(DEFAULT_MUSIC_SOURCE_DATA.generateDuration).toBe(30);
    });
  });
});
