import {
  getClerkPublicData,
  resolveAuthToken,
} from '@helpers/auth/clerk.helper';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authClientMocks = vi.hoisted(() => ({
  getBetterAuthToken: vi.fn<() => Promise<string | null>>(async () => null),
}));

// resolveAuthToken reads NEXT_PUBLIC_BETTER_AUTH_ENABLED inline and dynamically
// imports getBetterAuthToken only when on — vi.mock intercepts the dynamic
// import too.
vi.mock('@genfeedai/auth-client', () => ({
  getBetterAuthToken: authClientMocks.getBetterAuthToken,
}));

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

  describe('resolveAuthToken (dual-run, #735)', () => {
    beforeEach(() => {
      // This jsdom env does not provide localStorage; define a fresh in-memory
      // stub each test so getPlaywrightJwtToken's fallback is exercisable.
      const store = new Map<string, string>();
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          clear: () => store.clear(),
          getItem: (key: string) => store.get(key) ?? null,
          removeItem: (key: string) => store.delete(key),
          setItem: (key: string, value: string) => store.set(key, value),
        },
        writable: true,
      });
    });

    afterEach(() => {
      vi.clearAllMocks();
      delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    });

    it('uses Better Auth by default and ignores the legacy getToken callback', async () => {
      authClientMocks.getBetterAuthToken.mockResolvedValue('ba-jwt');
      const getToken = vi.fn(async () => 'clerk-token');

      await expect(resolveAuthToken(getToken)).resolves.toBe('ba-jwt');
      expect(getToken).not.toHaveBeenCalled();
    });

    it('delegates to the legacy getToken callback when Better Auth is explicitly off', async () => {
      process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'false';
      const getToken = vi.fn(async () => 'clerk-token');

      await expect(resolveAuthToken(getToken)).resolves.toBe('clerk-token');
      expect(getToken).toHaveBeenCalledTimes(1);
      expect(authClientMocks.getBetterAuthToken).not.toHaveBeenCalled();
    });

    it('uses the Better Auth JWT and ignores Clerk getToken when on', async () => {
      process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'true';
      authClientMocks.getBetterAuthToken.mockResolvedValue('ba-jwt');
      const getToken = vi.fn(async () => 'clerk-token');

      await expect(resolveAuthToken(getToken)).resolves.toBe('ba-jwt');
      expect(getToken).not.toHaveBeenCalled();
    });

    it('falls back to the Playwright JWT when Better Auth has no token', async () => {
      process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'true';
      authClientMocks.getBetterAuthToken.mockResolvedValue(null);
      window.localStorage.setItem('clerk-db-jwt', 'pw-jwt');
      const getToken = vi.fn(async () => 'clerk-token');

      await expect(resolveAuthToken(getToken)).resolves.toBe('pw-jwt');
    });
  });
});
