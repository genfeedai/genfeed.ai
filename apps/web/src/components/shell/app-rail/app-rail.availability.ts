import {
  isNativeAppLaunchable,
  isNativeSecondaryAppId,
  NATIVE_SECONDARY_APP_IDS,
  resolveNativeAppAvailability,
} from '@genfeedai/contracts/constants';
import type { AppRailItemConfig } from '@genfeedai/contracts/interfaces/ui/app-rail.interface';
import type { AppRailProps } from '@/props/ui/app-rail.props';
import { APP_RAIL_REGISTRY, isAppRailItemEnabled } from './app-rail.registry';

interface LauncherAvailabilityInput
  extends Pick<AppRailProps, 'installedAppIds' | 'moduleAccess'> {
  flags: Readonly<Record<string, unknown>>;
}

/**
 * A launcher app shows only while its platform switches are on and the member
 * has it installed with organization, subscription and release access. An
 * absent `installedAppIds` or `moduleAccess` is a neutral surface with no
 * member or organization to consult.
 */
export function isLauncherAppAvailable(
  app: AppRailItemConfig,
  { flags, installedAppIds, moduleAccess }: LauncherAvailabilityInput,
): boolean {
  if (!isNativeSecondaryAppId(app.id)) return false;
  return isNativeAppLaunchable(
    resolveNativeAppAvailability({
      appId: app.id,
      flags,
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
  moduleAccess,
  modulePreferences,
}: ResolveAvailableRailAppsInput): AppRailItemConfig[] {
  return APP_RAIL_REGISTRY.filter((app) => {
    if (!isAppRailItemEnabled(app, flags)) {
      return false;
    }
    if (app.group === 'app') {
      return isLauncherAppAvailable(app, {
        flags,
        installedAppIds,
        moduleAccess,
      });
    }
    return (
      !app.organizationModule ||
      modulePreferences === undefined ||
      modulePreferences?.[app.organizationModule] === true
    );
  });
}
