'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { NativeSecondaryAppId } from '@genfeedai/contracts/constants';
import type {
  InstalledAppsContextValue,
  InstalledAppsProviderProps,
} from '@genfeedai/props/ui/installed-apps.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { MembersService } from '@services/organization/members.service';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const InstalledAppsContext = createContext<InstalledAppsContextValue>({
  install: async () => false,
  installedAppIds: [],
  pendingAppIds: [],
  status: 'loading',
  uninstall: async () => false,
});

/**
 * The signed-in member's personal app installations in the current
 * organization (#5502), shared by the rail launcher and the Store. Only
 * server-confirmed lists are shown: a failed write keeps the last confirmed
 * state, and an organization switch discards responses from the previous one.
 */
export function InstalledAppsProvider({
  children,
}: InstalledAppsProviderProps) {
  const { organizationId } = useBrand();
  const getMembers = useAuthedService((token) =>
    MembersService.getInstance(token),
  );
  const [installedAppIds, setInstalledAppIds] = useState<
    readonly NativeSecondaryAppId[]
  >([]);
  const [status, setStatus] =
    useState<InstalledAppsContextValue['status']>('loading');
  const [pendingAppIds, setPendingAppIds] = useState<
    readonly NativeSecondaryAppId[]
  >([]);
  const scopeRef = useRef(0);
  const writeQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    const controller = new AbortController();
    scopeRef.current += 1;
    writeQueueRef.current = Promise.resolve();
    setInstalledAppIds([]);
    setPendingAppIds([]);
    setStatus('loading');
    if (!organizationId) {
      return () => controller.abort();
    }

    void (async () => {
      try {
        const members = await getMembers();
        if (controller.signal.aborted) return;
        const ids = await members.findMyApps(controller.signal);
        if (controller.signal.aborted) return;
        setInstalledAppIds(ids);
        setStatus('ready');
      } catch {
        if (controller.signal.aborted) return;
        setStatus('error');
      }
    })();

    return () => controller.abort();
  }, [getMembers, organizationId]);

  const write = useCallback(
    (appId: NativeSecondaryAppId, isInstalled: boolean): Promise<boolean> => {
      const scope = scopeRef.current;
      setPendingAppIds((previous) =>
        previous.includes(appId) ? previous : [...previous, appId],
      );
      // One write at a time so the server applies changes in request order.
      const result = writeQueueRef.current.then(async () => {
        if (scope !== scopeRef.current) return false;
        try {
          const members = await getMembers();
          const ids = isInstalled
            ? await members.installApp(appId)
            : await members.uninstallApp(appId);
          if (scope !== scopeRef.current) return false;
          setInstalledAppIds(ids);
          setStatus('ready');
          return true;
        } catch {
          return false;
        } finally {
          if (scope === scopeRef.current) {
            setPendingAppIds((previous) =>
              previous.filter((pendingAppId) => pendingAppId !== appId),
            );
          }
        }
      });
      writeQueueRef.current = result;
      return result;
    },
    [getMembers],
  );

  const install = useCallback(
    (appId: NativeSecondaryAppId) => write(appId, true),
    [write],
  );
  const uninstall = useCallback(
    (appId: NativeSecondaryAppId) => write(appId, false),
    [write],
  );

  const value = useMemo(
    () => ({ install, installedAppIds, pendingAppIds, status, uninstall }),
    [install, installedAppIds, pendingAppIds, status, uninstall],
  );

  return (
    <InstalledAppsContext.Provider value={value}>
      {children}
    </InstalledAppsContext.Provider>
  );
}

export function useInstalledApps(): InstalledAppsContextValue {
  return use(InstalledAppsContext);
}
