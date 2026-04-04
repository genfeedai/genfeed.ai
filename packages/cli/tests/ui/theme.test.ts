import { describe, expect, it, vi } from 'vitest';

vi.mock('chalk', () => {
  const chalkFn = (text: string) => text;
  const hexFn = () => chalkFn;
  return {
    default: {
      blue: chalkFn,
      bold: chalkFn,
      dim: chalkFn,
      green: chalkFn,
      hex: hexFn,
      red: chalkFn,
      yellow: chalkFn,
    },
  };
});

import {
  colors,
  formatError,
  formatHeader,
  formatInfo,
  formatLabel,
  formatSuccess,
  formatWarning,
  symbols,
} from '../../src/ui/theme.js';

describe('ui/theme', () => {
  describe('colors', () => {
    it('has primary color function', () => {
      expect(typeof colors.primary).toBe('function');
      const result = colors.primary('test');
      expect(result).toContain('test');
    });

    it('has success color function', () => {
      expect(typeof colors.success).toBe('function');
      const result = colors.success('success message');
      expect(result).toContain('success message');
    });

    it('has error color function', () => {
      expect(typeof colors.error).toBe('function');
      const result = colors.error('error message');
      expect(result).toContain('error message');
    });

    it('has warning color function', () => {
      expect(typeof colors.warning).toBe('function');
      const result = colors.warning('warning message');
      expect(result).toContain('warning message');
    });

    it('has info color function', () => {
      expect(typeof colors.info).toBe('function');
      const result = colors.info('info message');
      expect(result).toContain('info message');
    });

    it('has dim color function', () => {
      expect(typeof colors.dim).toBe('function');
      const result = colors.dim('dimmed');
      expect(result).toContain('dimmed');
    });

    it('has bold color function', () => {
      expect(typeof colors.bold).toBe('function');
      const result = colors.bold('bold text');
      expect(result).toContain('bold text');
    });
  });

  describe('symbols', () => {
    it('has success symbol', () => {
      expect(symbols.success).toContain('✓');
    });

    it('has error symbol', () => {
      expect(symbols.error).toContain('✖');
    });

    it('has warning symbol', () => {
      expect(symbols.warning).toContain('⚠');
    });

    it('has info symbol', () => {
      expect(symbols.info).toContain('ℹ');
    });

    it('has arrow symbol', () => {
      expect(symbols.arrow).toContain('→');
    });

    it('has bullet symbol', () => {
      expect(symbols.bullet).toContain('•');
    });
  });

  describe('formatSuccess', () => {
    it('formats success message with symbol', () => {
      const result = formatSuccess('Operation completed');
      expect(result).toContain('✓');
      expect(result).toContain('Operation completed');
    });
  });

  describe('formatError', () => {
    it('formats error message with symbol', () => {
      const result = formatError('Something went wrong');
      expect(result).toContain('✖');
      expect(result).toContain('Something went wrong');
    });
  });

  describe('formatWarning', () => {
    it('formats warning message with symbol', () => {
      const result = formatWarning('Be careful');
      expect(result).toContain('⚠');
      expect(result).toContain('Be careful');
    });
  });

  describe('formatInfo', () => {
    it('formats info message with symbol', () => {
      const result = formatInfo('FYI');
      expect(result).toContain('ℹ');
      expect(result).toContain('FYI');
    });
  });

  describe('formatLabel', () => {
    it('formats label with value', () => {
      const result = formatLabel('Name', 'John');
      expect(result).toContain('Name:');
      expect(result).toContain('John');
    });

    it('includes proper spacing', () => {
      const result = formatLabel('Status', 'Active');
      expect(result.startsWith('  ')).toBe(true);
    });
  });

  describe('formatHeader', () => {
    it('formats header text with bold', () => {
      const result = formatHeader('Section Title');
      expect(result).toContain('Section Title');
    });

    it('returns styled string', () => {
      const result = formatHeader('Header');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
