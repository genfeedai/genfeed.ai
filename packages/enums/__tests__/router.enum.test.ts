import { describe, expect, it } from 'vitest';
import { RouterPriority } from '../src/router.enum';

describe('router.enum', () => {
  describe('RouterPriority', () => {
    it('should have 4 members', () => {
      expect(Object.values(RouterPriority)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(RouterPriority.QUALITY).toBe('quality');
      expect(RouterPriority.SPEED).toBe('speed');
      expect(RouterPriority.COST).toBe('cost');
      expect(RouterPriority.BALANCED).toBe('balanced');
    });
  });
});
