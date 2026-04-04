import { describe, expect, it } from 'vitest';
import { MemberRole } from '../src/member.enum';

describe('member.enum', () => {
  describe('MemberRole', () => {
    it('should have 6 members', () => {
      expect(Object.values(MemberRole)).toHaveLength(6);
    });

    it('should have correct values', () => {
      expect(MemberRole.OWNER).toBe('owner');
      expect(MemberRole.ADMIN).toBe('admin');
      expect(MemberRole.CREATOR).toBe('creator');
      expect(MemberRole.ANALYTICS).toBe('analytics');
      expect(MemberRole.USER).toBe('user');
      expect(MemberRole.SUPPORT).toBe('support');
    });
  });
});
