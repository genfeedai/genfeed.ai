import { describe, expect, it } from 'vitest';
import {
  BentoRowSpan,
  BentoSize,
  BentoSpan,
  BentoVariant,
} from '../src/bento.enum';

describe('bento.enum', () => {
  describe('BentoSpan', () => {
    it('should have 3 members', () => {
      expect(Object.values(BentoSpan)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(BentoSpan.SINGLE).toBe('single');
      expect(BentoSpan.DOUBLE).toBe('double');
      expect(BentoSpan.FULL).toBe('full');
    });
  });

  describe('BentoRowSpan', () => {
    it('should have 2 members', () => {
      expect(
        Object.values(BentoRowSpan).filter((v) => typeof v === 'number'),
      ).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(BentoRowSpan.ONE).toBe(1);
      expect(BentoRowSpan.TWO).toBe(2);
    });
  });

  describe('BentoVariant', () => {
    it('should have 3 members', () => {
      expect(Object.values(BentoVariant)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(BentoVariant.DEFAULT).toBe('default');
      expect(BentoVariant.WHITE).toBe('white');
      expect(BentoVariant.BLACK).toBe('black');
    });
  });

  describe('BentoSize', () => {
    it('should have 3 members', () => {
      expect(Object.values(BentoSize)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(BentoSize.SM).toBe('sm');
      expect(BentoSize.MD).toBe('md');
      expect(BentoSize.LG).toBe('lg');
    });
  });
});
