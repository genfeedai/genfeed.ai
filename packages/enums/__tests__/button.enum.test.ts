import { describe, expect, it } from 'vitest';
import { ButtonSize, ButtonVariant } from '../src/button.enum';

describe('button.enum', () => {
  describe('ButtonVariant', () => {
    it('should have 6 semantic members', () => {
      expect(Object.values(ButtonVariant)).toHaveLength(6);
    });

    it('should have correct values', () => {
      expect(ButtonVariant.DEFAULT).toBe('default');
      expect(ButtonVariant.SECONDARY).toBe('secondary');
      expect(ButtonVariant.GHOST).toBe('ghost');
      expect(ButtonVariant.DESTRUCTIVE).toBe('destructive');
      expect(ButtonVariant.LINK).toBe('link');
      expect(ButtonVariant.UNSTYLED).toBe('unstyled');
    });
  });

  describe('ButtonSize', () => {
    it('should have 6 members', () => {
      expect(Object.values(ButtonSize)).toHaveLength(6);
    });

    it('should have correct values', () => {
      expect(ButtonSize.DEFAULT).toBe('default');
      expect(ButtonSize.SM).toBe('sm');
      expect(ButtonSize.LG).toBe('lg');
      expect(ButtonSize.XS).toBe('xs');
      expect(ButtonSize.ICON).toBe('icon');
      expect(ButtonSize.PUBLIC).toBe('public');
    });
  });
});
