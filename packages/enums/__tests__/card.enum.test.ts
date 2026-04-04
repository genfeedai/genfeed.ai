import { describe, expect, it } from 'vitest';
import { CardEmptySize, CardSize, CardVariant } from '../src/card.enum';

describe('card.enum', () => {
  describe('CardVariant', () => {
    it('should have 3 members', () => {
      expect(Object.values(CardVariant)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(CardVariant.DEFAULT).toBe('default');
      expect(CardVariant.WHITE).toBe('white');
      expect(CardVariant.BLACK).toBe('black');
    });
  });

  describe('CardSize', () => {
    it('should have 5 members', () => {
      expect(Object.values(CardSize)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(CardSize.DEFAULT).toBe('default');
      expect(CardSize.SM).toBe('sm');
      expect(CardSize.MD).toBe('md');
      expect(CardSize.LG).toBe('lg');
      expect(CardSize.PILL).toBe('pill');
    });
  });

  describe('CardEmptySize', () => {
    it('should have 3 members', () => {
      expect(Object.values(CardEmptySize)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(CardEmptySize.DEFAULT).toBe('default');
      expect(CardEmptySize.SM).toBe('sm');
      expect(CardEmptySize.LG).toBe('lg');
    });
  });
});
