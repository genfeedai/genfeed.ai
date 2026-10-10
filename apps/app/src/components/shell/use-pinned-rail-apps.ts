'use client';

import { isNativeSecondaryAppId } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { UsersService } from '@services/organization/users.service';
import { useCallback, useEffect, useRef, useState } from 'react';

function pinnableIds(ids: readonly string[] | undefined): string[] {
  return [...new Set((ids ?? []).filter(isNativeSecondaryAppId))];
}

function toggledIds(ids: readonly string[], appId: string): string[] {
  return ids.includes(appId)
    ? ids.filter((id) => id !== appId)
    : [...ids, appId];
}

/** The signed-in user's rail pins. Stored on their settings row. */
export function usePinnedRailApps() {
  const getUsers = useAuthedService((token) => UsersService.getInstance(token));
  const [pinnedAppIds, setPinnedAppIds] = useState<string[]>([]);
  const toggleRef = useRef<(appId: string) => void>(() => {});

  useEffect(() => {
    const controller = new AbortController();
    let desired: string[] = [];
    let confirmed: string[] = [];
    let revision = 0;
    let isReady = false;
    let isSaving = false;
    const queuedToggles: string[] = [];
    setPinnedAppIds([]);

    // One write at a time prevents the server from storing out-of-order lists.
    // Responses from earlier revisions never replace a newer optimistic edit.
    const save = async () => {
      if (!isReady || isSaving || controller.signal.aborted) return;
      isSaving = true;
      try {
        while (!controller.signal.aborted) {
          const submittedRevision = revision;
          const next = [...desired];
          try {
            const users = await getUsers();
            if (controller.signal.aborted) return;
            const saved = await users.patchMeSettings({ pinnedAppIds: next });
            if (controller.signal.aborted) return;
            confirmed = pinnableIds(saved.pinnedAppIds);
            if (submittedRevision === revision) {
              desired = confirmed;
              setPinnedAppIds(confirmed);
              return;
            }
          } catch {
            if (controller.signal.aborted) return;
            if (submittedRevision === revision) {
              desired = confirmed;
              setPinnedAppIds(confirmed);
              return;
            }
          }
        }
      } finally {
        isSaving = false;
      }
    };

    const toggle = (appId: string) => {
      if (!isNativeSecondaryAppId(appId) || controller.signal.aborted) return;
      revision += 1;
      if (!isReady) queuedToggles.push(appId);
      desired = toggledIds(desired, appId);
      setPinnedAppIds(desired);
      void save();
    };
    toggleRef.current = toggle;

    void (async () => {
      try {
        const users = await getUsers();
        if (controller.signal.aborted) return;
        const settings = await users.findMeSettings(controller.signal);
        if (controller.signal.aborted) return;
        confirmed = pinnableIds(settings.pinnedAppIds);
        desired = queuedToggles.reduce(toggledIds, confirmed);
        isReady = true;
        setPinnedAppIds(desired);
        if (queuedToggles.length > 0) void save();
      } catch {
        if (controller.signal.aborted) return;
        // Do not replace unknown saved preferences after a failed initial read.
        setPinnedAppIds([]);
        toggleRef.current = () => {};
      }
    })();

    return () => {
      controller.abort();
      if (toggleRef.current === toggle) toggleRef.current = () => {};
    };
  }, [getUsers]);

  const togglePin = useCallback((appId: string) => {
    toggleRef.current(appId);
  }, []);

  return { pinnedAppIds, togglePin };
}
