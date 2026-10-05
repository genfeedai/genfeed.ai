'use client';

import { DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG } from '@genfeedai/contracts/constants';
import { isDesktopLocalModeEnabled } from '@genfeedai/contracts/desktop';
import { usePlatformFlags } from '@/lib/platform-flags/use-platform-flags';

interface DesktopLocalWorkspaceFlagState {
  /** False in cloud-only builds: no local-mode entry point may render at all. */
  isAvailable: boolean;
  isEnabled: boolean;
  isReady: boolean;
}

/**
 * Whether the desktop local workspace can be entered. `isAvailable` is the
 * build-time local-mode switch (`isDesktopLocalModeEnabled`); `isEnabled` additionally
 * follows the Admin `desktop_local_workspace` feature flag (#5468).
 */
export function useDesktopLocalWorkspaceFlag(): DesktopLocalWorkspaceFlagState {
  const { flags, isReady } = usePlatformFlags();
  return {
    isAvailable: isDesktopLocalModeEnabled(),
    isEnabled:
      isDesktopLocalModeEnabled() &&
      flags[DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG],
    isReady,
  };
}
