'use client';

import { DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG } from '@genfeedai/contracts/constants';
import {
  useDesktopLocalModeEnabled,
  useIsDesktopLocalModeHydrating,
} from '@/lib/desktop/use-desktop-local-mode-enabled';
import { usePlatformFlags } from '@/lib/platform-flags/use-platform-flags';

interface DesktopLocalWorkspaceFlagState {
  /** False in cloud-only builds: no local-mode entry point may render at all. */
  isAvailable: boolean;
  /** True while hydration still shows the build constant; do not redirect yet. */
  isHydrating: boolean;
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
  const isLocalModeEnabled = useDesktopLocalModeEnabled();
  const isHydrating = useIsDesktopLocalModeHydrating();
  return {
    isAvailable: isLocalModeEnabled,
    isEnabled:
      isLocalModeEnabled && flags[DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG],
    isHydrating,
    isReady,
  };
}
