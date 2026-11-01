import { describe, expect, it } from 'vitest';
import {
  CardEmptySize,
  CardGap,
  CardPadding,
  CardSize,
  CardTone,
  CardVariant,
} from '../../src/enums/card.enum';

describe('card.enum', () => {
  describe('CardVariant', () => {
    it('should have 3 members', () => {
      expect(Object.values(CardVariant)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(CardVariant.DEFAULT).toBe('default');
      expect(CardVariant.BORDERED).toBe('bordered');
      expect(CardVariant.INSET).toBe('inset');
    });
  });

  describe('CardPadding', () => {
    it('should have correct values', () => {
      expect(Object.values(CardPadding)).toEqual([
        'none',
        'sm',
        'md',
        'lg',
        'xl',
      ]);
    });
  });

  describe('CardTone', () => {
    it('should have correct values', () => {
      expect(Object.values(CardTone)).toEqual([
        'success',
        'warning',
        'destructive',
      ]);
    });
  });

  describe('CardGap', () => {
    it('should have correct values', () => {
      expect(Object.values(CardGap)).toEqual(['none', 'sm', 'md', 'lg']);
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
