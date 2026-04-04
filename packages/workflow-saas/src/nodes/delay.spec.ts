import { describe, expect, it } from 'vitest';
import { DEFAULT_DELAY_DATA } from './delay';

describe('delay node', () => {
  describe('DEFAULT_DELAY_DATA', () => {
    it('should have label set to Delay', () => {
      expect(DEFAULT_DELAY_DATA.label).toBe('Delay');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_DELAY_DATA.status).toBe('idle');
    });

    it('should have type set to delay', () => {
      expect(DEFAULT_DELAY_DATA.type).toBe('delay');
    });

    it('should default mode to fixed', () => {
      expect(DEFAULT_DELAY_DATA.mode).toBe('fixed');
    });

    it('should default duration to 5', () => {
      expect(DEFAULT_DELAY_DATA.duration).toBe(5);
    });

    it('should default unit to minutes', () => {
      expect(DEFAULT_DELAY_DATA.unit).toBe('minutes');
    });

    it('should default untilTime to empty string', () => {
      expect(DEFAULT_DELAY_DATA.untilTime).toBe('');
    });

    it('should default platform to empty string', () => {
      expect(DEFAULT_DELAY_DATA.platform).toBe('');
    });

    it('should default timezone to UTC', () => {
      expect(DEFAULT_DELAY_DATA.timezone).toBe('UTC');
    });
  });
});
