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
  hasFullAssetUploadConsent: boolean;
  apiEndpoint: string;
  localUserId: string | null;
  session: IDesktopSession | null;
}): SyncState & { triggerSync: () => void } {
  const localUserId = opts.localUserId;
  const sessionToken = opts.session?.token;
  const sessionUserId = opts.session?.userId;
  const syncContextVersion = [
    opts.apiEndpoint,
    String(opts.hasFullAssetUploadConsent),
    localUserId,
    sessionToken,
    sessionUserId,
  ].join('\0');
  const [state, setState] = useState<SyncState>({
    errors: [],
    isSyncing: false,
    lastSyncAt: null,
  });

  const optsRef = useRef(opts);
  const activeControllerRef = useRef<AbortController | null>(null);
  optsRef.current = opts;

  const runSync = useCallback(async () => {
    if (activeControllerRef.current) return;

    const { hasFullAssetUploadConsent, apiEndpoint, localUserId, session } =
      optsRef.current;
    if (!session || !localUserId) return;

    const controller = new AbortController();
    activeControllerRef.current = controller;
    setState((prev) => ({ ...prev, errors: [], isSyncing: true }));

    try {
      const result = await syncService.run({
        hasFullAssetUploadConsent,
        apiEndpoint,
        localUserId,
        session,
        signal: controller.signal,
      });
      if (
        controller.signal.aborted ||
        activeControllerRef.current !== controller
      ) {
        return;
      }
      setState({
        errors: result.errors,
        isSyncing: false,
        lastSyncAt: new Date().toISOString(),
      });
    } catch (e) {
      if (
        controller.signal.aborted ||
        activeControllerRef.current !== controller
      ) {
        return;
      }
      setState({
        errors: [e instanceof Error ? e.message : 'Sync failed'],
        isSyncing: false,
        lastSyncAt: null,
      });
    } finally {
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
    }
  }, []);

  const triggerSync = useCallback(() => {
    void runSync();
  }, [runSync]);

  useEffect(() => {
    if (syncContextVersion && sessionUserId && localUserId) {
      void runSync();
    } else {
      setState((prev) => ({ ...prev, isSyncing: false }));
    }
    return () => {
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
    };
  }, [localUserId, runSync, sessionUserId, syncContextVersion]);

  // Subscribe to main-process triggered syncs (sign-in, focus)
  useEffect(() => {
    const dispose = window.genfeedDesktop.sync.onSyncThreadsRequested(() => {
      void runSync();
    });
    return dispose;
  }, [runSync]);

  return { ...state, triggerSync };
}
