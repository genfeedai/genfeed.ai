'use client';

import { DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG } from '@genfeedai/contracts/constants';
import { usePlatformFlags } from '@/lib/platform-flags/use-platform-flags';

interface DesktopLocalWorkspaceFlagState {
  isEnabled: boolean;
  isReady: boolean;
}

/** The Admin `desktop_local_workspace` feature flag (#5468). */
export function useDesktopLocalWorkspaceFlag(): DesktopLocalWorkspaceFlagState {
  const { flags, isReady } = usePlatformFlags();
  return { isEnabled: flags[DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG], isReady };
}
