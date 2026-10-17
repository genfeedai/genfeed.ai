'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  ORGANIZATION_MODULE_IDS,
  type OrganizationModuleAccess,
  type OrganizationModuleId,
  resolveOrganizationModulePreferences,
  resolveOrganizationModulePresentationAccess,
} from '@genfeedai/contracts/constants';
import { useFeatureFlagContext } from '@genfeedai/hooks/feature-flags/provider';
import { resolveAvailableRailApps } from '@ui/shell/app-rail/app-rail.availability';
import { useMemo } from 'react';
import { useInstalledApps } from '@/components/shell/installed-apps.provider';

const NO_INSTALLED_APP_IDS: readonly string[] = [];

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
  const { settings, settingsLoading } = useBrand();
  const { flags: platformFlags, isConfigured } = useFeatureFlagContext();
  const installedApps = useInstalledApps();
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
  const installedAppIds =
    installedApps.status === 'ready'
      ? installedApps.installedAppIds
      : NO_INSTALLED_APP_IDS;
  const apps = useMemo(
    () =>
      resolveAvailableRailApps({
        flags: platformFlags,
        installedAppIds,
        isConfigured,
        moduleAccess,
        modulePreferences,
      }),
    [
      installedAppIds,
      isConfigured,
      moduleAccess,
      modulePreferences,
      platformFlags,
    ],
  );

  return {
    apps,
    installedAppIds,
    isReady: !settingsLoading && installedApps.status !== 'loading',
    moduleAccess,
    modulePreferences,
  };
}
