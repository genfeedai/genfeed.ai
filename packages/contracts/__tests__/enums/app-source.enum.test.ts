import { describe, expect, it } from 'vitest';
import { AppSource } from '../../src/enums/app-source.enum';

describe('app-source.enum', () => {
  describe('AppSource', () => {
    it('should have correct values', () => {
      expect(AppSource.GENFEED).toBe('GENFEED');
      expect(AppSource.GETSHAREABLE).toBe('GETSHAREABLE');
    });
  });
});
