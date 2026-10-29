'use client';

import type { AgentApiService } from '@genfeedai/agent';
import { useEffect, useState } from 'react';

interface MasterThreadState {
  hasFailed: boolean;
  isLoading: boolean;
  masterThreadId: string | null;
}

/**
 * The caller's master thread id. The server creates the master on first read,
 * so this resolves to an id for any signed-in member of the organization.
 */
export function useMasterThread(
  apiService: Pick<AgentApiService, 'getMasterThread'> | null,
  isEnabled: boolean,
): MasterThreadState {
  const [state, setState] = useState<MasterThreadState>({
    hasFailed: false,
    isLoading: true,
    masterThreadId: null,
  });

  useEffect(() => {
    if (!isEnabled || !apiService) {
      return;
    }

    const controller = new AbortController();
    apiService
      .getMasterThread(controller.signal)
      .then((master) => {
        if (!controller.signal.aborted) {
          setState({
            hasFailed: false,
            isLoading: false,
            masterThreadId: master.id,
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ hasFailed: true, isLoading: false, masterThreadId: null });
        }
      });

    return () => controller.abort();
  }, [apiService, isEnabled]);

  return state;
}
