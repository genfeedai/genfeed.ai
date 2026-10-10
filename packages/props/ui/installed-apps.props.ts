import type { NativeSecondaryAppId } from '@genfeedai/contracts/constants';
import type { ReactNode } from 'react';

/** Load state of the caller's personal app installations (#5502). */
export type InstalledAppsStatus = 'loading' | 'ready' | 'error';

export interface InstalledAppsContextValue {
  /** Server-confirmed installations in the current organization. */
  installedAppIds: readonly NativeSecondaryAppId[];
  status: InstalledAppsStatus;
  /** Apps with an install or uninstall request in flight. */
  pendingAppIds: readonly NativeSecondaryAppId[];
  /** Resolves false when the server refused or the request failed. */
  install: (appId: NativeSecondaryAppId) => Promise<boolean>;
  uninstall: (appId: NativeSecondaryAppId) => Promise<boolean>;
}

export interface InstalledAppsProviderProps {
  children: ReactNode;
}
