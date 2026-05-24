import { beforeEach, describe, expect, it, vi } from 'vitest';

const getTokenMock = vi.fn();
const getBootstrapMock = vi.fn();
const getInstanceMock = vi.fn(() => ({
  getBootstrap: getBootstrapMock,
}));
const cookiesMock = vi.fn(async () => ({
  get: vi.fn(() => undefined),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => ({
    getToken: getTokenMock,
    sessionId: 'session_123',
    userId: 'user_123',
  }),
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

vi.mock('@services/auth/auth.service', () => ({
  AuthService: {
    getInstance: getInstanceMock,
  },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    JWT_LABEL: 'genfeed',
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('loadProtectedBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;
    delete process.env.NEXT_PUBLIC_GENFEED_CLOUD;
    delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
    process.env.CLERK_SECRET_KEY = 'sk_test';
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test';
    delete process.env.PLAYWRIGHT_TEST;
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => undefined),
    });
    getTokenMock.mockResolvedValue('token_123');
    getBootstrapMock.mockResolvedValue({
      access: {
        brandId: 'brand_123',
        creditsBalance: 50,
        hasEverHadCredits: true,
        isOnboardingCompleted: true,
        isSuperAdmin: false,
        organizationId: 'org_123',
        subscriptionStatus: 'active',
        subscriptionTier: 'pro',
        userId: 'user_123',
      },
      brands: [{ id: 'brand_123', label: 'Alpha' }],
      currentUser: { id: 'user_123' },
      darkroomCapabilities: { brandEnabled: true },
      settings: { organization: 'org_123' },
      streak: { currentStreak: 6 },
    });
  });

  it('loads the protected shell through one auth bootstrap call', async () => {
    const { loadProtectedBootstrap } = await import(
      '@app-server/protected-bootstrap.server'
    );

    const result = await loadProtectedBootstrap();

    expect(getInstanceMock).toHaveBeenCalledWith('token_123');
    expect(getBootstrapMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      accessState: expect.objectContaining({
        brandId: 'brand_123',
        organizationId: 'org_123',
      }),
      brandId: 'brand_123',
      brands: [{ id: 'brand_123', label: 'Alpha' }],
      currentUser: { id: 'user_123' },
      darkroomCapabilities: { brandEnabled: true },
      organizationId: 'org_123',
      settings: { organization: 'org_123' },
      streak: { currentStreak: 6 },
    });
  });

  it('still loads bootstrap in hybrid mode without an EE license key', async () => {
    delete process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;

    const { getServerAuthToken, loadProtectedBootstrap } = await import(
      '@app-server/protected-bootstrap.server'
    );

    await expect(getServerAuthToken()).resolves.toBe('token_123');
    await expect(loadProtectedBootstrap()).resolves.toEqual(
      expect.objectContaining({
        brandId: 'brand_123',
        organizationId: 'org_123',
      }),
    );
    expect(getInstanceMock).toHaveBeenCalledWith('token_123');
  });

  it('skips server auth bootstrap in Playwright mode', async () => {
    process.env.PLAYWRIGHT_TEST = 'true';

    const { getServerAuthToken, loadProtectedBootstrap } = await import(
      '@app-server/protected-bootstrap.server'
    );

    await expect(getServerAuthToken()).resolves.toBe('');
    await expect(loadProtectedBootstrap()).resolves.toBeNull();
    expect(getInstanceMock).not.toHaveBeenCalled();
  });

  it('skips server auth bootstrap when the Playwright bypass cookie is present', async () => {
    cookiesMock.mockResolvedValue({
      get: vi.fn((name: string) =>
        name === '__playwright_test' ? { value: 'true' } : undefined,
      ),
    });

    const { getServerAuthToken, loadProtectedBootstrap } = await import(
      '@app-server/protected-bootstrap.server'
    );

    await expect(getServerAuthToken()).resolves.toBe('');
    await expect(loadProtectedBootstrap()).resolves.toBeNull();
    expect(getInstanceMock).not.toHaveBeenCalled();
  });

  it('falls back to self-hosted bootstrap when server auth throws in hybrid mode', async () => {
    vi.doMock('@clerk/nextjs/server', () => ({
      auth: vi.fn(async () => {
        throw new Error('auth middleware missing');
      }),
    }));

    const { getServerAuthToken, loadProtectedBootstrap } = await import(
      '@app-server/protected-bootstrap.server'
    );

    await expect(getServerAuthToken()).resolves.toBe('');
    await expect(loadProtectedBootstrap()).resolves.toEqual(
      expect.objectContaining({
        brandId: 'brand_123',
        organizationId: 'org_123',
      }),
    );
    expect(getInstanceMock).toHaveBeenCalledWith('');
  });

  it('returns null when server auth throws in cloud mode', async () => {
    process.env.NEXT_PUBLIC_GENFEED_CLOUD = 'true';
    vi.doMock('@clerk/nextjs/server', () => ({
      auth: vi.fn(async () => {
        throw new Error('auth middleware missing');
      }),
    }));

    const { getServerAuthToken, loadProtectedBootstrap } = await import(
      '@app-server/protected-bootstrap.server'
    );

    await expect(getServerAuthToken()).resolves.toBe('');
    await expect(loadProtectedBootstrap()).resolves.toBeNull();
    expect(getInstanceMock).not.toHaveBeenCalled();
  });

  it('skips cloud bootstrap in desktop shell mode without a desktop session token', async () => {
    process.env.NEXT_PUBLIC_DESKTOP_SHELL = '1';
    getTokenMock.mockResolvedValue('');

    const { getServerAuthToken, loadProtectedBootstrap } = await import(
      '@app-server/protected-bootstrap.server'
    );

    await expect(getServerAuthToken()).resolves.toBe('');
    await expect(loadProtectedBootstrap()).resolves.toBeNull();
    expect(getInstanceMock).not.toHaveBeenCalled();
  });

  it('still loads bootstrap without Clerk keys in self-hosted mode', async () => {
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

    const { getServerAuthToken, loadProtectedBootstrap } = await import(
      '@app-server/protected-bootstrap.server'
    );

    await expect(getServerAuthToken()).resolves.toBe('');
    await expect(loadProtectedBootstrap()).resolves.toEqual(
      expect.objectContaining({
        brandId: 'brand_123',
        organizationId: 'org_123',
      }),
    );
    expect(getInstanceMock).toHaveBeenCalledWith('');
  });
});
