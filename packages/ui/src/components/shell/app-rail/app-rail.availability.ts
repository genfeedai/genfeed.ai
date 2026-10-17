import {
  isNativeAppLaunchable,
  isNativeSecondaryAppId,
  NATIVE_SECONDARY_APP_IDS,
  resolveNativeAppAvailability,
} from '@genfeedai/contracts/constants';
import type { AppRailItemConfig } from '@genfeedai/contracts/interfaces/ui/app-rail.interface';
import type { AppRailProps } from '@genfeedai/props/ui/app-rail.props';
import { APP_RAIL_REGISTRY, isAppRailItemEnabled } from './app-rail.registry';

type LauncherAvailabilityInput = Pick<
  AppRailProps,
  'installedAppIds' | 'moduleAccess'
>;

/**
 * A launcher app shows only while its platform switches are on and the member
 * has it installed with organization, subscription and release access. An
 * absent `installedAppIds` or `moduleAccess` is a neutral surface with no
 * member or organization to consult.
 */
export function isLauncherAppAvailable(
  app: AppRailItemConfig,
  { installedAppIds, moduleAccess }: LauncherAvailabilityInput,
): boolean {
  if (!isNativeSecondaryAppId(app.id)) return false;
  return isNativeAppLaunchable(
    resolveNativeAppAvailability({
      appId: app.id,
      installedAppIds: installedAppIds ?? NATIVE_SECONDARY_APP_IDS,
      organizationAccess:
        moduleAccess === undefined || !app.organizationModule
          ? { isAllowed: true, reason: null }
          : (moduleAccess?.[app.organizationModule] ?? null),
      pinnedAppIds: [],
    }),
  );
}

interface ResolveAvailableRailAppsInput
  extends LauncherAvailabilityInput,
    Pick<AppRailProps, 'modulePreferences'> {
  flags: Readonly<Record<string, unknown>>;
  isConfigured: boolean;
}

/**
 * The apps this member can open right now: every platform switch is on, and a
 * launcher app is also installed with organization access. The rail and the
 * home page choice both draw from this list, so neither can offer an app the
 * other would hide.
 */
export function resolveAvailableRailApps({
  flags,
  installedAppIds,
  isConfigured,
  moduleAccess,
  modulePreferences,
}: ResolveAvailableRailAppsInput): AppRailItemConfig[] {
  return APP_RAIL_REGISTRY.filter((app) => {
    if (!isAppRailItemEnabled(app, flags, isConfigured)) {
      return false;
    }
    if (app.group === 'app') {
      return isLauncherAppAvailable(app, { installedAppIds, moduleAccess });
    }
    return (
      !app.organizationModule ||
      modulePreferences === undefined ||
      modulePreferences?.[app.organizationModule] === true
    );
  });
}
