import { describe, expect, it } from 'vitest';
import { PlatformRole } from '../src/platform-role.enum';

describe('platform-role.enum', () => {
  describe('PlatformRole', () => {
    it('has default user and superadmin members', () => {
      expect(Object.values(PlatformRole)).toEqual(['USER', 'SUPERADMIN']);
    });
  });
});
