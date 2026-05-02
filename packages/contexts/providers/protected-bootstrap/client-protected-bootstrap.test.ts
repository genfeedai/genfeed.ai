import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearClientProtectedBootstrapCache,
  loadClientProtectedBootstrap,
  mapProtectedBootstrapPayload,
} from './client-protected-bootstrap';

const payload = {
  access: {
    brandId: 'brand_123',
    creditsBalance: 10,
    hasEverHadCredits: true,
    isOnboardingCompleted: true,
    isSuperAdmin: false,
    organizationId: 'org_123',
    subscriptionStatus: 'active',
    subscriptionTier: 'payg',
    userId: 'user_123',
  },
  brands: [{ id: 'brand_123', label: 'Alpha' }],
  currentUser: { id: 'user_123' },
  darkroomCapabilities: null,
  settings: { organization: 'org_123' },
  streak: null,
};

describe('client protected bootstrap cache', () => {
  beforeEach(() => {
    clearClientProtectedBootstrapCache();
  });

  it('maps the auth bootstrap payload into protected bootstrap data', () => {
    expect(mapProtectedBootstrapPayload(payload as never)).toEqual({
      accessState: payload.access,
      brandId: 'brand_123',
      brands: payload.brands,
      currentUser: payload.currentUser,
      darkroomCapabilities: null,
      organizationId: 'org_123',
      settings: payload.settings,
      streak: null,
    });
  });

  it('coalesces concurrent bootstrap loads and reuses the cached result', async () => {
    const getBootstrap = vi.fn().mockResolvedValue(payload);
    const getAuthService = vi.fn().mockResolvedValue({ getBootstrap });

    const [first, second] = await Promise.all([
      loadClientProtectedBootstrap(
        'protected-bootstrap:user:org',
        getAuthService,
      ),
      loadClientProtectedBootstrap(
        'protected-bootstrap:user:org',
        getAuthService,
      ),
    ]);
    const third = await loadClientProtectedBootstrap(
      'protected-bootstrap:user:org',
      getAuthService,
    );

    expect(first).toEqual(second);
    expect(third).toEqual(first);
    expect(getAuthService).toHaveBeenCalledTimes(1);
    expect(getBootstrap).toHaveBeenCalledTimes(1);
  });

  it('clears failed loads so the next caller can retry', async () => {
    const getBootstrap = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(payload);
    const getAuthService = vi.fn().mockResolvedValue({ getBootstrap });

    await expect(
      loadClientProtectedBootstrap(
        'protected-bootstrap:user:org',
        getAuthService,
      ),
    ).rejects.toThrow('offline');

    await expect(
      loadClientProtectedBootstrap(
        'protected-bootstrap:user:org',
        getAuthService,
      ),
    ).resolves.toMatchObject({
      brandId: 'brand_123',
      organizationId: 'org_123',
    });
    expect(getBootstrap).toHaveBeenCalledTimes(2);
  });
});
