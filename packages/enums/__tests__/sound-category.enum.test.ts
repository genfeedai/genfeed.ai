import { describe, expect, it } from 'vitest';
import { SoundCategory } from '../src/sound-category.enum';

describe('sound-category.enum', () => {
  describe('SoundCategory', () => {
    it('should have 5 members', () => {
      expect(Object.values(SoundCategory)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(SoundCategory.AMBIENCE).toBe('ambience');
      expect(SoundCategory.SFX).toBe('sfx');
      expect(SoundCategory.MUSIC).toBe('music');
      expect(SoundCategory.DIALOGUE).toBe('dialogue');
      expect(SoundCategory.FOLEY).toBe('foley');
    });
  });
});
