import { describe, expect, it } from 'vitest';
import { ButtonSize, ButtonVariant } from '../../src/enums/button.enum';

describe('button.enum', () => {
  describe('ButtonVariant', () => {
    it('should have 7 members', () => {
      expect(Object.values(ButtonVariant)).toHaveLength(7);
    });

    it('should have correct values', () => {
      expect(ButtonVariant.DEFAULT).toBe('default');
      expect(ButtonVariant.SECONDARY).toBe('secondary');
      expect(ButtonVariant.GHOST).toBe('ghost');
      expect(ButtonVariant.DESTRUCTIVE).toBe('destructive');
      expect(ButtonVariant.LINK).toBe('link');
      expect(ButtonVariant.OVERLAY).toBe('overlay');
      expect(ButtonVariant.UNSTYLED).toBe('unstyled');
    });
  });

  describe('ButtonSize', () => {
    it('should have 8 members', () => {
      expect(Object.values(ButtonSize)).toHaveLength(8);
    });

    it('should have correct values', () => {
      expect(ButtonSize.DEFAULT).toBe('default');
      expect(ButtonSize.SM).toBe('sm');
      expect(ButtonSize.LG).toBe('lg');
      expect(ButtonSize.XS).toBe('xs');
      expect(ButtonSize.MICRO).toBe('micro');
      expect(ButtonSize.INLINE).toBe('inline');
      expect(ButtonSize.ICON).toBe('icon');
      expect(ButtonSize.PUBLIC).toBe('public');
    });
  });
});
