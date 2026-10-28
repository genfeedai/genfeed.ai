// @vitest-environment jsdom
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCompleteOnboarding } from './use-complete-onboarding.hook';

const mocks = vi.hoisted(() => ({
  token: 'token' as string | null,
  patch: vi.fn(),
  reload: vi.fn(),
  isCompleted: false,
  brand: undefined as
    | { organization: { slug: string }; slug: string }
    | undefined,
}));
vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => ({
    currentUser: { id: 'user-1', isOnboardingCompleted: mocks.isCompleted },
  }),
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ selectedBrand: mocks.brand }),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: vi.fn() }),
}));
vi.mock('@hooks/auth/use-auth-user/use-auth-user', () => ({
  useAuthUser: () => ({ user: { reload: mocks.reload } }),
}));
vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: () => Promise.resolve(mocks.token),
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));
vi.mock('@services/organization/users.service', () => ({
  UsersService: { getInstance: () => ({ patchMe: mocks.patch }) },
}));

describe('useCompleteOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.patch.mockReset();
    mocks.patch.mockResolvedValue(undefined);
    mocks.token = 'token';
    mocks.isCompleted = false;
    mocks.brand = undefined;
    localStorage.setItem('gf_onboarding_brand_domain', 'acme.co');
  });
  it('keeps onboarding open when the authenticated completion write fails', async () => {
    mocks.patch.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useCompleteOnboarding());
    await expect(result.current()).rejects.toThrow('network');
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(localStorage.getItem('gf_onboarding_brand_domain')).toBe('acme.co');
  });
  it('does not leave onboarding without authentication', async () => {
    mocks.token = null;
    const { result } = renderHook(() => useCompleteOnboarding());
    await expect(result.current()).rejects.toThrow('Authentication');
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.reload).not.toHaveBeenCalled();
  });
  it('writes nothing when a finished user replays onboarding', async () => {
    mocks.isCompleted = true;
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const { result } = renderHook(() => useCompleteOnboarding());
    await result.current();
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
  it('lands on the brand workspace by default', async () => {
    mocks.brand = { organization: { slug: 'acme' }, slug: 'main' };
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const { result } = renderHook(() => useCompleteOnboarding());
    await result.current();
    expect(assign).toHaveBeenCalledWith('/acme/main/workspace');
    vi.unstubAllGlobals();
  });
  it('lands on the draft posts when asked to', async () => {
    mocks.brand = { organization: { slug: 'acme' }, slug: 'main' };
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const { result } = renderHook(() => useCompleteOnboarding());
    await result.current({ isLandingOnDrafts: true });
    expect(assign).toHaveBeenCalledWith(
      '/acme/main/publishing/posts?status=draft',
    );
    vi.unstubAllGlobals();
  });
  it('falls back to the workspace when the brand slugs are not known yet', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const { result } = renderHook(() => useCompleteOnboarding());
    await result.current({ isLandingOnDrafts: true });
    expect(assign).toHaveBeenCalledWith(APP_ROUTES.WORKSPACE.OVERVIEW);
    vi.unstubAllGlobals();
  });
});
