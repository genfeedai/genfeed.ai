'use client';

import { isPinnableAppId } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { UsersService } from '@services/organization/users.service';
import { useCallback, useEffect, useState } from 'react';

function pinnableIds(ids: readonly string[] | undefined): string[] {
  return (ids ?? []).filter(isPinnableAppId);
}

/** The signed-in user's rail pins. Stored on their settings row. */
export function usePinnedRailApps() {
  const getUsers = useAuthedService((token) => UsersService.getInstance(token));
  const [pinnedAppIds, setPinnedAppIds] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const users = await getUsers();
        const settings = await users.findMeSettings(controller.signal);
        if (!controller.signal.aborted) {
          setPinnedAppIds(pinnableIds(settings.pinnedAppIds));
        }
      } catch {
        // The rail keeps the default order when settings cannot load.
      }
    })();
    return () => controller.abort();
  }, [getUsers]);

  const togglePin = useCallback(
    (appId: string) => {
      if (!isPinnableAppId(appId)) return;
      setPinnedAppIds((current) => {
        const next = current.includes(appId)
          ? current.filter((id) => id !== appId)
          : [...current, appId];
        void (async () => {
          const previous = current;
          try {
            const users = await getUsers();
            const saved = await users.patchMeSettings({ pinnedAppIds: next });
            setPinnedAppIds(pinnableIds(saved.pinnedAppIds));
          } catch {
            setPinnedAppIds(previous);
          }
        })();
        return next;
      });
    },
    [getUsers],
  );

  return { pinnedAppIds, togglePin };
}
