import type {
  NativeAppAvailabilityState,
  NativeSecondaryAppId,
} from '@genfeedai/contracts/constants';
import type { IconComponent } from '@genfeedai/contracts/types/icon';

/** One native app in the Store (#5502), with its resolved state for the member. */
export interface StoreAppEntry {
  appId: NativeSecondaryAppId;
  description: string;
  icon: IconComponent;
  /** Installed for this member, whether or not access currently allows it. */
  isInstalled: boolean;
  label: string;
  /** Where the app opens for new work. */
  openHref: string;
  state: NativeAppAvailabilityState;
}

export interface StoreAppCardProps {
  app: StoreAppEntry;
  /** Set after the last install or uninstall request for this app failed. */
  failedAction: 'install' | 'uninstall' | null;
  isPending: boolean;
  manageModulesHref: string;
  onInstall: (appId: NativeSecondaryAppId) => void;
  onUninstall: (appId: NativeSecondaryAppId) => void;
  subscriptionHref: string;
}

export interface StoreAppAccessNoteProps
  extends Pick<StoreAppCardProps, 'manageModulesHref' | 'subscriptionHref'> {
  state: StoreAppEntry['state'];
}
