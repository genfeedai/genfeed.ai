import { describe, expect, it } from 'vitest';
import { Timeframe } from '../src/timeframe.enum';

describe('timeframe.enum', () => {
  describe('Timeframe', () => {
    it('should have 8 members', () => {
      expect(Object.values(Timeframe)).toHaveLength(8);
    });

    it('should have correct values', () => {
      expect(Timeframe.H1).toBe('1h');
      expect(Timeframe.H6).toBe('6h');
      expect(Timeframe.H12).toBe('12h');
      expect(Timeframe.H24).toBe('24h');
      expect(Timeframe.H72).toBe('72h');
      expect(Timeframe.D7).toBe('7d');
      expect(Timeframe.D30).toBe('30d');
      expect(Timeframe.D90).toBe('90d');
    });
  });
});
