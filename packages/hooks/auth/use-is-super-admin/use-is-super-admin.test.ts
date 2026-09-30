import { useIsSuperAdmin } from '@hooks/auth/use-is-super-admin/use-is-super-admin';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseAuthUser = vi.fn();
const mockGetAuthPublicData = vi.fn();
const mockGetPlaywrightAuthState = vi.fn();

vi.mock('@hooks/auth/use-auth-user/use-auth-user', () => ({
  useAuthUser: () => mockUseAuthUser(),
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  getAuthPublicData: (user: unknown) => mockGetAuthPublicData(user),
  getPlaywrightAuthState: () => mockGetPlaywrightAuthState(),
}));

describe('useIsSuperAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlaywrightAuthState.mockReturnValue(null);
  });

  it('returns false when no user', () => {
    mockUseAuthUser.mockReturnValue({ user: null });

    const { result } = renderHook(() => useIsSuperAdmin());

    expect(result.current).toBe(false);
    expect(mockGetAuthPublicData).not.toHaveBeenCalled();
  });

  it('returns true when user is super admin', () => {
    const mockUser = { id: 'user-1' };
    mockUseAuthUser.mockReturnValue({ user: mockUser });
    mockGetAuthPublicData.mockReturnValue({ isSuperAdmin: true });

    const { result } = renderHook(() => useIsSuperAdmin());

    expect(result.current).toBe(true);
    expect(mockGetAuthPublicData).toHaveBeenCalledWith(mockUser);
  });

  it('returns false when user is not super admin', () => {
    const mockUser = { id: 'user-2' };
    mockUseAuthUser.mockReturnValue({ user: mockUser });
    mockGetAuthPublicData.mockReturnValue({ isSuperAdmin: false });

    const { result } = renderHook(() => useIsSuperAdmin());

    expect(result.current).toBe(false);
  });
});
