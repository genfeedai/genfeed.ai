import { MemberRole } from '@genfeedai/contracts';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUserRole } from './use-user-role';

const mocks = vi.hoisted(() => ({ user: vi.fn(), playwright: vi.fn() }));
vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  useOptionalUser: mocks.user,
}));
vi.mock('@helpers/auth/auth.helper', () => ({
  getPlaywrightAuthState: mocks.playwright,
}));

describe('useUserRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.playwright.mockReturnValue(null);
  });
  it.each([
    MemberRole.OWNER,
    MemberRole.ADMIN,
    MemberRole.CREATOR,
    MemberRole.USER,
  ])('returns the bootstrap membership role %s', (memberRole) => {
    mocks.user.mockReturnValue({ memberRole });
    expect(renderHook(() => useUserRole()).result.current).toBe(memberRole);
  });
  it('returns undefined while the bootstrap is loading', () => {
    mocks.user.mockReturnValue({ memberRole: undefined });
    expect(renderHook(() => useUserRole()).result.current).toBeUndefined();
  });
  it('returns null after loading with no membership', () => {
    mocks.user.mockReturnValue({ memberRole: null });
    expect(renderHook(() => useUserRole()).result.current).toBeNull();
  });
  it('rejects an unknown bootstrap role', () => {
    mocks.user.mockReturnValue({ memberRole: 'unknown-role' });
    expect(renderHook(() => useUserRole()).result.current).toBeNull();
  });
  it('preserves the Playwright bypass role without bootstrap data', () => {
    mocks.user.mockReturnValue(undefined);
    mocks.playwright.mockReturnValue({
      publicMetadata: { role: MemberRole.OWNER },
    });
    expect(renderHook(() => useUserRole()).result.current).toBe(
      MemberRole.OWNER,
    );
  });
});
