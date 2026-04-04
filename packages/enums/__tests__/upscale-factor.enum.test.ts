import { describe, expect, it } from 'vitest';
import { UpscaleFactor } from '../src/upscale-factor.enum';

describe('upscale-factor.enum', () => {
  describe('UpscaleFactor', () => {
    it('should have 3 members', () => {
      expect(Object.values(UpscaleFactor)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(UpscaleFactor._2X).toBe('2x');
      expect(UpscaleFactor._4X).toBe('4x');
      expect(UpscaleFactor._6X).toBe('6x');
    });
  });
});
