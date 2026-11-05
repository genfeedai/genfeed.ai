'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { NativeSecondaryAppId } from '@genfeedai/contracts/constants';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { MembersService } from '@services/organization/members.service';
import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  InstalledAppsContextValue,
  InstalledAppsProviderProps,
} from '@/props/ui/installed-apps.props';

const InstalledAppsContext = createContext<InstalledAppsContextValue>({
  install: async () => false,
  installedAppIds: [],
  pendingAppIds: [],
  status: 'loading',
  uninstall: async () => false,
});

const NO_APP_IDS: readonly NativeSecondaryAppId[] = [];

function createMembersService(token: string): MembersService {
  return MembersService.getInstance(token);
}

/**
 * The signed-in member's personal app installations in the current
 * organization (#5502), shared by the rail launcher and Apps. Only
 * server-confirmed lists are shown: a failed write keeps the last confirmed
 * state, and an organization switch discards responses from the previous one.
 * The list is cached per organization (and viewer), so the rail paints the
 * installed apps at once on return; a confirmed write goes into that cache.
 */
export function InstalledAppsProvider({
  children,
}: InstalledAppsProviderProps) {
  const { organizationId } = useBrand();
  const queryClient = useQueryClient();
  const getMembers = useAuthedService(createMembersService);
  const installedAppsKey = useMemo<QueryKey>(
    () => ['installed-apps', organizationId || null],
    [organizationId],
  );
  const installedAppsQuery = useAuthedQuery<
    MembersService,
    readonly NativeSecondaryAppId[]
  >({
    enabled: Boolean(organizationId),
    queryFn: (members, signal) => members.findMyApps(signal),
    queryKey: installedAppsKey,
    service: createMembersService,
  });
  const installedAppIds = installedAppsQuery.data ?? NO_APP_IDS;
  const status: InstalledAppsContextValue['status'] =
    installedAppsQuery.data !== undefined
      ? 'ready'
      : installedAppsQuery.isError
        ? 'error'
        : 'loading';
  const [pendingAppIds, setPendingAppIds] = useState<
    readonly NativeSecondaryAppId[]
  >([]);
  const scopeRef = useRef(0);
  const writeQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  // biome-ignore lint/correctness/useExhaustiveDependencies: an organization switch retires the previous organization's writes.
  useEffect(() => {
    scopeRef.current += 1;
    writeQueueRef.current = Promise.resolve();
    setPendingAppIds([]);
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
          // A read still in flight began before this write; drop it so it
          // cannot put the old list back.
          await queryClient.cancelQueries({ queryKey: installedAppsKey });
          queryClient.setQueriesData<readonly NativeSecondaryAppId[]>(
            { queryKey: installedAppsKey },
            ids,
          );
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
    [getMembers, installedAppsKey, queryClient],
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
