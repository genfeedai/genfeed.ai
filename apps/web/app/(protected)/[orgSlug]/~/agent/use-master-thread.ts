'use client';

import type { AgentApiService } from '@genfeedai/agent';
import { useEffect, useState } from 'react';
import type { MasterThreadState } from '@/features/agents/props/master-thread.props';

type MasterThreadApi = Pick<AgentApiService, 'getMasterThread'>;

/**
 * The last master id each API client resolved. The master workspace unmounts
 * while a thread is open full size; coming back must paint the master at once
 * instead of waiting on another read for an id that does not change.
 */
const resolvedMasterThreadIds = new WeakMap<MasterThreadApi, string>();

function readInitialState(
  apiService: MasterThreadApi | null,
): MasterThreadState {
  const cachedId = apiService ? resolvedMasterThreadIds.get(apiService) : null;
  return cachedId
    ? { hasFailed: false, isLoading: false, masterThreadId: cachedId }
    : { hasFailed: false, isLoading: true, masterThreadId: null };
}

/**
 * The caller's master thread id. The server creates the master on first read,
 * so this resolves to an id for any signed-in member of the organization.
 */
export function useMasterThread(
  apiService: MasterThreadApi | null,
  isEnabled: boolean,
): MasterThreadState {
  const [state, setState] = useState<MasterThreadState>(() =>
    readInitialState(apiService),
  );

  useEffect(() => {
    if (!isEnabled || !apiService) {
      return;
    }
    const cachedId = resolvedMasterThreadIds.get(apiService);
    if (cachedId) {
      setState((current) =>
        current.masterThreadId === cachedId
          ? current
          : { hasFailed: false, isLoading: false, masterThreadId: cachedId },
      );
      return;
    }

    const controller = new AbortController();
    apiService
      .getMasterThread(controller.signal)
      .then((master) => {
        if (!controller.signal.aborted) {
          resolvedMasterThreadIds.set(apiService, master.id);
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
