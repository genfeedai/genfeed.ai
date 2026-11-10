import {
  isCoreAppId,
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
    if (!app.organizationModule) {
      return true;
    }
    // Trends needs a paid plan: an organization without one does not get a
    // rail item that opens a locked page.
    if (
      moduleAccess?.[app.organizationModule]?.reason === 'subscription-required'
    ) {
      return false;
    }
    return (
      modulePreferences === undefined ||
      modulePreferences?.[app.organizationModule] === true
    );
  });
}

/**
 * The apps the organization offers its members, whatever each member installed:
 * platform switches on, released and shown by the organization. Entry points on
 * other pages use it, so none points at an app the organization does not have.
 */
export function resolveOrganizationApps({
  flags,
  moduleAccess,
  modulePreferences,
}: Omit<
  ResolveAvailableRailAppsInput,
  'installedAppIds'
>): AppRailItemConfig[] {
  return resolveAvailableRailApps({
    flags,
    installedAppIds: NATIVE_SECONDARY_APP_IDS,
    moduleAccess,
    modulePreferences,
  });
}

/**
 * Whether the organization has an app beyond the core set (Workspace, Trends,
 * Library, Publishing, Analytics and Agent). The Apps link and the Modules
 * settings page exist for choosing among those apps, so they show only then.
 */
export function hasAppsBeyondDashboard(
  input: Omit<ResolveAvailableRailAppsInput, 'installedAppIds'>,
): boolean {
  return resolveOrganizationApps(input).some((app) => !isCoreAppId(app.id));
}
