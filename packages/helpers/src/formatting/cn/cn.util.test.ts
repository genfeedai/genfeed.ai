import { BG_BLUR, BORDER_WHITE_30, cn } from '@helpers/formatting/cn/cn.util';
import { describe, expect, it } from 'vitest';

describe('cn.util', () => {
  describe('cn', () => {
    it('should merge multiple class names', () => {
      expect(cn('base', 'additional')).toBe('base additional');
    });

    it('should handle a single class name', () => {
      expect(cn('single')).toBe('single');
    });

    it('should return empty string for no inputs', () => {
      expect(cn()).toBe('');
    });

    it('should filter out false values', () => {
      expect(cn('base', false && 'excluded')).toBe('base');
    });

    it('should include truthy conditional classes', () => {
      expect(cn('base', true && 'included')).toBe('base included');
    });

    it('should filter out null values', () => {
      expect(cn('base', null)).toBe('base');
    });

    it('should filter out undefined values', () => {
      expect(cn('base', undefined)).toBe('base');
    });

    it('should filter out empty strings', () => {
      expect(cn('base', '', 'valid')).toBe('base valid');
    });

    it('should handle mixed falsy values', () => {
      expect(cn('base', null, undefined, false, '', 0, 'valid')).toBe(
        'base valid',
      );
    });

    it('should resolve Tailwind conflicts by keeping last class', () => {
      expect(cn('p-4', 'p-2')).toBe('p-2');
    });

    it('should resolve margin conflicts', () => {
      expect(cn('m-4', 'm-2')).toBe('m-2');
    });

    it('should resolve text color conflicts', () => {
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    });

    it('should resolve background color conflicts', () => {
      expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
    });

    it('should not merge non-conflicting classes', () => {
      expect(cn('p-4', 'm-2', 'text-red-500')).toBe('p-4 m-2 text-red-500');
    });

    it('should resolve font size conflicts', () => {
      expect(cn('text-sm', 'text-lg')).toBe('text-lg');
    });

    it('should handle array inputs', () => {
      expect(cn(['base', 'class'])).toBe('base class');
    });

    it('should handle object inputs with boolean values', () => {
      expect(cn({ active: true, base: true, disabled: false })).toBe(
        'active base',
      );
    });

    it('should handle complex nested inputs', () => {
      const result = cn('base', ['nested'], { conditional: true });
      expect(result).toBe('base nested conditional');
    });

    it('should resolve conflicting width classes', () => {
      expect(cn('w-full', 'w-1/2')).toBe('w-1/2');
    });

    it('should resolve conflicting display classes', () => {
      expect(cn('block', 'flex')).toBe('flex');
    });

    it('should resolve conflicting rounded classes', () => {
      expect(cn('rounded-sm', 'rounded-lg')).toBe('rounded-lg');
    });
  });

  describe('constants', () => {
    it('BG_BLUR should contain translucent gradient and blur classes', () => {
      expect(BG_BLUR).toContain('bg-gradient-to-t');
      expect(BG_BLUR).toContain('from-black/80');
      expect(BG_BLUR).toContain('backdrop-blur-xl');
    });

    it('BORDER_WHITE_30 should contain border and shadow classes', () => {
      expect(BORDER_WHITE_30).toContain('border');
      expect(BORDER_WHITE_30).toContain('border-white/[0.16]');
      expect(BORDER_WHITE_30).toContain(
        'shadow-[0_-8px_32px_rgba(0,0,0,0.45)]',
      );
    });
  });
});
