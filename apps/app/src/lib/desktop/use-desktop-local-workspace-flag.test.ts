import { DEFAULT_PLATFORM_FLAGS } from '@genfeedai/contracts/constants';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesktopLocalWorkspaceFlag } from './use-desktop-local-workspace-flag';

const platformFlags = vi.hoisted(() => ({
  state: { flags: {} as Record<string, boolean>, isReady: true },
}));

vi.mock('@/lib/platform-flags/use-platform-flags', () => ({
  usePlatformFlags: () => platformFlags.state,
}));

describe('useDesktopLocalWorkspaceFlag (#5468)', () => {
  beforeEach(() => {
    platformFlags.state = {
      flags: { ...DEFAULT_PLATFORM_FLAGS },
      isReady: true,
    };
  });

  it('follows the Admin flag', () => {
    platformFlags.state.flags.desktop_local_workspace = false;

    const { result } = renderHook(() => useDesktopLocalWorkspaceFlag());

    expect(result.current).toEqual({ isEnabled: false, isReady: true });
  });

  it('reports not ready until the flags load', () => {
    platformFlags.state.isReady = false;

    const { result } = renderHook(() => useDesktopLocalWorkspaceFlag());

    expect(result.current).toEqual({ isEnabled: true, isReady: false });
  });
});
