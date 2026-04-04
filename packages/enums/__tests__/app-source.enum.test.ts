import { describe, expect, it } from 'vitest';
import { AppSource } from '../src/app-source.enum';

describe('app-source.enum', () => {
  describe('AppSource', () => {
    it('should have 2 members', () => {
      expect(Object.values(AppSource)).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(AppSource.GENFEED).toBe('genfeed');
      expect(AppSource.GETSHAREABLE).toBe('getshareable');
    });
  });
});
