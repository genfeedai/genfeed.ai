import { BG_BLUR, BORDER_WHITE_30, cn } from '@helpers/formatting/cn/cn.util';
import { describe, expect, it } from 'vitest';

describe('cn.util', () => {
  describe('cn', () => {
    it('should merge multiple class names', () => {
      expect(cn('base', 'additional')).toBe('base additional');
    });
  });

  describe('constants', () => {
    it('BG_BLUR should contain translucent surface and blur classes', () => {
      expect(BG_BLUR).toContain('bg-popover/80');
      expect(BG_BLUR).toContain('backdrop-blur-xl');
      expect(BG_BLUR).toContain('supports-[backdrop-filter]');
    });

    it('BORDER_WHITE_30 should contain rounded and shadow-dropdown token classes', () => {
      expect(BORDER_WHITE_30).toContain('rounded-lg');
      expect(BORDER_WHITE_30).toContain('shadow-dropdown');
    });
  });
});
