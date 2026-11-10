'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  ORGANIZATION_MODULE_IDS,
  type OrganizationModuleAccess,
  type OrganizationModuleId,
  ROUTE_MANIFEST_APPS,
  resolveOrganizationModulePreferences,
  resolveOrganizationModulePresentationAccess,
} from '@genfeedai/contracts/constants';
import { useCallback, useMemo } from 'react';
import {
  type AppRailPathRoots,
  getActiveAppId,
} from '@/components/shell/app-rail/app-rail.active-app';
import {
  hasAppsBeyondDashboard,
  resolveAvailableRailApps,
  resolveOrganizationApps,
} from '@/components/shell/app-rail/app-rail.availability';
import { useInstalledApps } from '@/components/shell/installed-apps.provider';
import { useFeatureFlagContext } from '@/hooks/feature-flags/provider';

const NO_INSTALLED_APP_IDS: readonly string[] = [];

// Path roots only: the icon-bearing registry stays out of this hook.
const APP_PATH_ROOTS: readonly AppRailPathRoots[] = ROUTE_MANIFEST_APPS.map(
  (app) => ({
    activePathRoots: [app.rootPath, ...(app.extraActivePathRoots ?? [])],
    id: app.id,
  }),
);

function useOrganizationModuleView() {
  const { settings, settingsLoading } = useBrand();
  const { flags: platformFlags } = useFeatureFlagContext();
  const modulePreferences = resolveOrganizationModulePreferences(
    settingsLoading ? null : settings,
    platformFlags,
  );
  const moduleAccess = useMemo<Partial<
    Record<OrganizationModuleId, OrganizationModuleAccess>
  > | null>(
    () =>
      settingsLoading
        ? null
        : Object.fromEntries(
            ORGANIZATION_MODULE_IDS.map((moduleId) => [
              moduleId,
              resolveOrganizationModulePresentationAccess(
                settings,
                moduleId,
                platformFlags,
              ),
            ]),
          ),
    [platformFlags, settings, settingsLoading],
  );

  return { moduleAccess, modulePreferences, platformFlags, settingsLoading };
}

/**
 * Whether the organization has an app beyond the core set (Workspace, Trends,
 * Library, Publishing, Analytics, Agent). The Apps link and the Modules settings page
 * show only then. It ignores what the member installed: the Apps page is where
 * they install. False while organization settings load.
 */
export function useHasAppsBeyondDashboard(): boolean {
  const { moduleAccess, modulePreferences, platformFlags } =
    useOrganizationModuleView();
  return useMemo(
    () =>
      hasAppsBeyondDashboard({
        flags: platformFlags,
        moduleAccess,
        modulePreferences,
      }),
    [moduleAccess, modulePreferences, platformFlags],
  );
}

/**
 * The ids of the apps the organization offers its members, whatever each
 * member installed. Entry points to an app on other pages render only while
 * its id is here, so none leads to an app the organization does not have. A
 * launcher app is absent while organization settings load, so no link flashes
 * before it is known to lead somewhere.
 */
export function useOrganizationAppIds(): ReadonlySet<string> {
  const { moduleAccess, modulePreferences, platformFlags } =
    useOrganizationModuleView();
  return useMemo(
    () =>
      new Set(
        resolveOrganizationApps({
          flags: platformFlags,
          moduleAccess,
          modulePreferences,
        }).map((app) => app.id),
      ),
    [moduleAccess, modulePreferences, platformFlags],
  );
}

/** Whether the organization offers one app; see `useOrganizationAppIds`. */
export function useIsAppAvailable(appId: string): boolean {
  return useOrganizationAppIds().has(appId);
}

/**
 * Whether a link may be shown: it leads outside every rail app, or into an app
 * the organization offers. Takes a scoped or a scope-relative path. Use it for
 * links built from data (a task, an activity, a run) whose destination app is
 * not known where they render.
 */
export function useIsHrefAvailable(): (href: string) => boolean {
  const appIds = useOrganizationAppIds();
  return useCallback(
    (href: string) => {
      // A scoped path (`/acme/brand/agent`) names its app directly; a
      // scope-relative one (`/agent/new`) needs a scope in front to read.
      const appId =
        getActiveAppId(APP_PATH_ROOTS, href) ??
        getActiveAppId(APP_PATH_ROOTS, `/_/_${href}`);
      return appId === undefined || appIds.has(appId);
    },
    [appIds],
  );
}

/**
 * What this member can open right now: platform flags, the organization's
 * module settings and release access, and the member's installed apps. The
 * rail and the home page choice share it so they never disagree.
 *
 * `isReady` is false while organization settings or installs are still
 * loading; `moduleAccess` is null in that window, which keeps launcher apps
 * hidden instead of guessing.
 */
export function useAvailableRailApps() {
  const { moduleAccess, modulePreferences, platformFlags, settingsLoading } =
    useOrganizationModuleView();
  const installedApps = useInstalledApps();
  const installedAppIds =
    installedApps.status === 'ready'
      ? installedApps.installedAppIds
      : NO_INSTALLED_APP_IDS;
  const apps = useMemo(
    () =>
      resolveAvailableRailApps({
        flags: platformFlags,
        installedAppIds,
        moduleAccess,
        modulePreferences,
      }),
    [installedAppIds, moduleAccess, modulePreferences, platformFlags],
  );

  return {
    apps,
    installedAppIds,
    isReady: !settingsLoading && installedApps.status !== 'loading',
    moduleAccess,
    modulePreferences,
  };
}
