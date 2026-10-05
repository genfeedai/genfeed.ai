import { DEFAULT_PLATFORM_FLAGS } from '@genfeedai/contracts/constants';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesktopLocalWorkspaceFlag } from './use-desktop-local-workspace-flag';

const platformFlags = vi.hoisted(() => ({
  state: { flags: {} as Record<string, boolean>, isReady: true },
}));

const buildFlag = vi.hoisted(() => ({ isLocalModeEnabled: true }));

vi.mock('@/lib/platform-flags/use-platform-flags', () => ({
  usePlatformFlags: () => platformFlags.state,
}));

vi.mock('@genfeedai/contracts/desktop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/contracts/desktop')>()),
  isDesktopLocalModeEnabled: () => buildFlag.isLocalModeEnabled,
}));

describe('useDesktopLocalWorkspaceFlag (#5468)', () => {
  beforeEach(() => {
    buildFlag.isLocalModeEnabled = true;
    platformFlags.state = {
      flags: { ...DEFAULT_PLATFORM_FLAGS },
      isReady: true,
    };
  });

  it('follows the Admin flag', () => {
    platformFlags.state.flags.desktop_local_workspace = false;

    const { result } = renderHook(() => useDesktopLocalWorkspaceFlag());

    expect(result.current).toEqual({
      isAvailable: true,
      isEnabled: false,
      isHydrating: false,
      isReady: true,
    });
  });

  it('reports not ready until the flags load', () => {
    platformFlags.state.isReady = false;

    const { result } = renderHook(() => useDesktopLocalWorkspaceFlag());

    expect(result.current).toEqual({
      isAvailable: true,
      isEnabled: true,
      isHydrating: false,
      isReady: false,
    });
  });

  it('is unavailable and disabled when the cloud-only build flag is off, whatever the Admin flag says', () => {
    buildFlag.isLocalModeEnabled = false;

    const { result } = renderHook(() => useDesktopLocalWorkspaceFlag());

    expect(result.current).toEqual({
      isAvailable: false,
      isEnabled: false,
      isHydrating: false,
      isReady: true,
    });
  });
});
