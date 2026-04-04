import { useIsSuperAdmin } from '@hooks/auth/use-is-super-admin/use-is-super-admin';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseUser = vi.fn();
const mockGetClerkPublicData = vi.fn();
const mockGetPlaywrightAuthState = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useUser: () => mockUseUser(),
}));

vi.mock('@helpers/auth/clerk.helper', () => ({
  getClerkPublicData: (user: unknown) => mockGetClerkPublicData(user),
  getPlaywrightAuthState: () => mockGetPlaywrightAuthState(),
}));

describe('useIsSuperAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlaywrightAuthState.mockReturnValue(null);
  });

  it('returns false when no user', () => {
    mockUseUser.mockReturnValue({ user: null });

    const { result } = renderHook(() => useIsSuperAdmin());

    expect(result.current).toBe(false);
    expect(mockGetClerkPublicData).not.toHaveBeenCalled();
  });

  it('returns true when user is super admin', () => {
    const mockUser = { id: 'user-1' };
    mockUseUser.mockReturnValue({ user: mockUser });
    mockGetClerkPublicData.mockReturnValue({ isSuperAdmin: true });

    const { result } = renderHook(() => useIsSuperAdmin());

    expect(result.current).toBe(true);
    expect(mockGetClerkPublicData).toHaveBeenCalledWith(mockUser);
  });

  it('returns false when user is not super admin', () => {
    const mockUser = { id: 'user-2' };
    mockUseUser.mockReturnValue({ user: mockUser });
    mockGetClerkPublicData.mockReturnValue({ isSuperAdmin: false });

    const { result } = renderHook(() => useIsSuperAdmin());

    expect(result.current).toBe(false);
  });
});
