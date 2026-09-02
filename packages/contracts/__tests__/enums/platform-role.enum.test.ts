import { describe, expect, it } from 'vitest';
import { PlatformRole } from '../../src';

describe('platform-role.enum', () => {
  describe('PlatformRole', () => {
    it('has default user and superadmin members', () => {
      expect(Object.values(PlatformRole)).toEqual(['USER', 'SUPERADMIN']);
    });
  });
});
