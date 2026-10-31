import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isBetterAuthEnabled: vi.fn(() => false),
  isCloudDeployment: vi.fn(() => false),
  useOptionalAuth: vi.fn(() => ({
    isSignedIn: false,
    userId: null as string | null,
  })),
}));

vi.mock('./useOptionalAuth', () => ({
  useOptionalAuth: mocks.useOptionalAuth,
}));

vi.mock('@genfeedai/auth-client', () => ({
  isBetterAuthEnabled: mocks.isBetterAuthEnabled,
}));

vi.mock('@genfeedai/config/deployment', () => ({
  isCloudDeployment: mocks.isCloudDeployment,
}));

import { useCloudSession } from './useCloudSession';

describe('useCloudSession', () => {
  beforeEach(() => {
    mocks.isBetterAuthEnabled.mockReturnValue(false);
    mocks.isCloudDeployment.mockReturnValue(false);
    mocks.useOptionalAuth.mockReturnValue({
      isSignedIn: false,
      userId: null,
    });
  });

  it('is not connected when signed in without a user id (desktop offline bypass)', () => {
    mocks.useOptionalAuth.mockReturnValue({
      isSignedIn: true,
      userId: null,
    });

    const { result } = renderHook(() => useCloudSession());

    expect(result.current.isConnected).toBe(false);
    expect(result.current.userId).toBeNull();
    expect(result.current.isCapable).toBe(false);
  });

  it('is connected only when signed in with a real user id', () => {
    mocks.useOptionalAuth.mockReturnValue({
      isSignedIn: true,
      userId: 'user-1',
    });

    const { result } = renderHook(() => useCloudSession());

    expect(result.current.isConnected).toBe(true);
    expect(result.current.userId).toBe('user-1');
  });

  it('is capable when cloud deployment or Better Auth is enabled', () => {
    mocks.isCloudDeployment.mockReturnValue(true);

    const { result: cloudResult } = renderHook(() => useCloudSession());
    expect(cloudResult.current.isCapable).toBe(true);

    mocks.isCloudDeployment.mockReturnValue(false);
    mocks.isBetterAuthEnabled.mockReturnValue(true);

    const { result: authResult } = renderHook(() => useCloudSession());
    expect(authResult.current.isCapable).toBe(true);
  });
});
