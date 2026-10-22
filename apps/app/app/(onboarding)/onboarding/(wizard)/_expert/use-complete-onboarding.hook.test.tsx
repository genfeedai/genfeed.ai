// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCompleteOnboarding } from './use-complete-onboarding.hook';

const mocks = vi.hoisted(() => ({
  token: 'token' as string | null,
  patch: vi.fn(),
  reload: vi.fn(),
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ selectedBrand: undefined }),
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
    mocks.token = 'token';
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
});
