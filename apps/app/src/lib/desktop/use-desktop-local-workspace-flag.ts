'use client';

import { DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG } from '@genfeedai/contracts/constants';
import { useEffect, useState } from 'react';
import {
  isAnalyticsEnabled,
  subscribeAnalyticsFeatureFlags,
} from '@/lib/analytics';

interface DesktopLocalWorkspaceFlagState {
  isEnabled: boolean;
  isReady: boolean;
}

export function useDesktopLocalWorkspaceFlag(): DesktopLocalWorkspaceFlagState {
  const [state, setState] = useState<DesktopLocalWorkspaceFlagState>(() => {
    const hasRemoteFlags = isAnalyticsEnabled();
    return {
      isEnabled: !hasRemoteFlags,
      isReady: !hasRemoteFlags,
    };
  });

  useEffect(() => {
    if (!isAnalyticsEnabled()) {
      setState({ isEnabled: true, isReady: true });
      return;
    }

    return subscribeAnalyticsFeatureFlags(
      [DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG],
      (flags) => {
        setState({
          isEnabled: flags[DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG] === true,
          isReady: true,
        });
      },
    );
  }, []);

  return state;
}
