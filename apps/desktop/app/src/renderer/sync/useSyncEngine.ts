'use client';

import type { IDesktopSession } from '@genfeedai/desktop-contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ThreadSyncService } from './thread-sync.service';

const syncService = new ThreadSyncService();

export type SyncState = {
  errors: string[];
  isSyncing: boolean;
  lastSyncAt: string | null;
};

export function useSyncEngine(opts: {
  apiEndpoint: string;
  localUserId: string | null;
  session: IDesktopSession | null;
}): SyncState & { triggerSync: () => void } {
  const [state, setState] = useState<SyncState>({
    errors: [],
    isSyncing: false,
    lastSyncAt: null,
  });

  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const runSync = useCallback(async () => {
    const { apiEndpoint, localUserId, session } = optsRef.current;
    if (!session || !localUserId) return;

    setState((prev) => ({ ...prev, errors: [], isSyncing: true }));
    try {
      const result = await syncService.run({
        apiEndpoint,
        localUserId,
        session,
      });
      setState({
        errors: result.errors,
        isSyncing: false,
        lastSyncAt: new Date().toISOString(),
      });
    } catch (e) {
      setState({
        errors: [e instanceof Error ? e.message : 'Sync failed'],
        isSyncing: false,
        lastSyncAt: null,
      });
    }
  }, []);

  const triggerSync = useCallback(() => {
    void runSync();
  }, [runSync]);

  // Subscribe to main-process triggered syncs (sign-in, focus)
  useEffect(() => {
    const dispose = window.genfeedDesktop.sync.onSyncThreadsRequested(() => {
      void runSync();
    });
    return dispose;
  }, [runSync]);

  return { ...state, triggerSync };
}
