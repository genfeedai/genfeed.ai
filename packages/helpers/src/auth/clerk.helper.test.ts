import { getClerkPublicData } from '@helpers/auth/clerk.helper';
import { describe, expect, it } from 'vitest';

describe('clerk.helper', () => {
  describe('getClerkPublicData', () => {
    it('returns publicMetadata from user object', () => {
      const mockUser = {
        publicMetadata: { orgId: 'org_123', role: 'admin' },
      } as never;
      const result = getClerkPublicData(mockUser);
      expect(result).toEqual({ orgId: 'org_123', role: 'admin' });
    });

    it('returns empty object when publicMetadata is undefined', () => {
      const mockUser = { publicMetadata: undefined } as never;
      const result = getClerkPublicData(mockUser);
      expect(result).toEqual({});
    });

    it('returns empty object when publicMetadata is null', () => {
      const mockUser = { publicMetadata: null } as never;
      const result = getClerkPublicData(mockUser);
      expect(result).toEqual({});
    });

    it('returns publicMetadata with nested data', () => {
      const metadata = {
        credits: 100,
        subscription: { plan: 'pro', status: 'active' },
      };
      const mockUser = { publicMetadata: metadata } as never;
      const result = getClerkPublicData(mockUser);
      expect(result).toEqual(metadata);
    });
  });
});
