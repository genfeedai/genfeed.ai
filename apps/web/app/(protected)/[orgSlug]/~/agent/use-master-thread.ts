'use client';

import type { AgentApiService } from '@genfeedai/agent';
import { useEffect, useState } from 'react';
import type { MasterThreadState } from '@/features/agents/props/master-thread.props';

type MasterThreadApi = Pick<AgentApiService, 'getMasterThread'>;

/**
 * The last master id each API client resolved, per organization. The master
 * workspace unmounts while a thread is open full size; coming back paints the
 * remembered master at once and checks it against the server in the
 * background. The client outlives an organization switch, so the id is kept
 * per organization and never shown in another one.
 */
const resolvedMasterThreadIds = new WeakMap<
  MasterThreadApi,
  Map<string, string>
>();

function readCachedId(
  apiService: MasterThreadApi | null,
  scopeKey: string,
): string | undefined {
  return apiService
    ? resolvedMasterThreadIds.get(apiService)?.get(scopeKey)
    : undefined;
}

function writeCachedId(
  apiService: MasterThreadApi,
  scopeKey: string,
  masterThreadId: string,
): void {
  const byScope = resolvedMasterThreadIds.get(apiService) ?? new Map();
  byScope.set(scopeKey, masterThreadId);
  resolvedMasterThreadIds.set(apiService, byScope);
}

function stateFor(cachedId: string | undefined): MasterThreadState {
  return cachedId
    ? { hasFailed: false, isLoading: false, masterThreadId: cachedId }
    : { hasFailed: false, isLoading: true, masterThreadId: null };
}

/**
 * The caller's master thread id. The server creates the master on first read,
 * so this resolves to an id for any signed-in member of the organization.
 * `scopeKey` names the organization the id belongs to.
 */
export function useMasterThread(
  apiService: MasterThreadApi | null,
  isEnabled: boolean,
  scopeKey: string,
): MasterThreadState {
  const [state, setState] = useState<MasterThreadState>(() =>
    stateFor(readCachedId(apiService, scopeKey)),
  );

  useEffect(() => {
    if (!isEnabled || !apiService) {
      return;
    }
    const cachedId = readCachedId(apiService, scopeKey);
    setState((current) =>
      cachedId && current.masterThreadId === cachedId
        ? current
        : stateFor(cachedId),
    );

    const controller = new AbortController();
    apiService
      .getMasterThread(controller.signal)
      .then((master) => {
        if (!controller.signal.aborted) {
          writeCachedId(apiService, scopeKey, master.id);
          setState((current) =>
            current.masterThreadId === master.id && !current.isLoading
              ? current
              : {
                  hasFailed: false,
                  isLoading: false,
                  masterThreadId: master.id,
                },
          );
        }
      })
      .catch(() => {
        // A failed check keeps a master already on screen.
        if (!controller.signal.aborted && !cachedId) {
          setState({ hasFailed: true, isLoading: false, masterThreadId: null });
        }
      });

    return () => controller.abort();
  }, [apiService, isEnabled, scopeKey]);

  return state;
}
