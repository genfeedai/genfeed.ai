import { describe, expect, it } from 'vitest';
import { MixMode } from '../src/mix-mode.enum';

describe('mix-mode.enum', () => {
  describe('MixMode', () => {
    it('should have 3 members', () => {
      expect(Object.values(MixMode)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(MixMode.REPLACE).toBe('replace');
      expect(MixMode.MIX).toBe('mix');
      expect(MixMode.BACKGROUND).toBe('background');
    });
  });
});
