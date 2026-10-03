'use client';

import { DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG } from '@genfeedai/contracts/constants';
import { IS_DESKTOP_LOCAL_MODE_ENABLED } from '@genfeedai/contracts/desktop';
import { usePlatformFlags } from '@/lib/platform-flags/use-platform-flags';

interface DesktopLocalWorkspaceFlagState {
  /** False in cloud-only builds: no local-mode entry point may render at all. */
  isAvailable: boolean;
  isEnabled: boolean;
  isReady: boolean;
}

/**
 * Whether the desktop local workspace can be entered. `isAvailable` is the
 * build-time `IS_DESKTOP_LOCAL_MODE_ENABLED` switch; `isEnabled` additionally
 * follows the Admin `desktop_local_workspace` feature flag (#5468).
 */
export function useDesktopLocalWorkspaceFlag(): DesktopLocalWorkspaceFlagState {
  const { flags, isReady } = usePlatformFlags();
  return {
    isAvailable: IS_DESKTOP_LOCAL_MODE_ENABLED,
    isEnabled:
      IS_DESKTOP_LOCAL_MODE_ENABLED &&
      flags[DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG],
    isReady,
  };
}
