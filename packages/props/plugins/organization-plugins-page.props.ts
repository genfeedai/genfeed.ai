import type {
  NativeAppAvailabilityState,
  NativeSecondaryAppId,
  OrganizationModuleId,
} from '@genfeedai/contracts/constants';
import type { IconComponent } from '@genfeedai/contracts/types/icon';

/** One native app in Plugins (#5502), with its resolved state for the member. */
export interface PluginAppEntry {
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

/** Categories an app is filed under; the category filter mirrors these. */
export type PluginCategoryId = 'create' | 'publish' | 'automate';

export type PluginFilterId = 'all' | PluginCategoryId;

/** Abstract mini-illustration drawn on an app's thumbnail. */
export type PluginThumbnailArt =
  | 'flow'
  | 'frames'
  | 'inbox'
  | 'layers'
  | 'motion'
  | 'prompt'
  | 'schedule'
  | 'stats'
  | 'timeline'
  | 'trend'
  | 'trim';

export type PluginThumbnailTone = 'info' | 'primary' | 'success' | 'warning';

export type PluginThumbnailSize = 'compact' | 'standard';

/** Plugins-only presentation data for one native app, keyed by app id. */
export interface PluginAppCatalogEntry {
  art: PluginThumbnailArt;
  category: PluginCategoryId;
  /** Real artwork; replaces the designed tile once an image exists. */
  thumbnailSrc?: string;
  tone: PluginThumbnailTone;
}

export interface PluginAppThumbnailProps {
  appId: OrganizationModuleId;
  icon: IconComponent;
  label: string;
  size: PluginThumbnailSize;
}

export interface PluginAppRowProps {
  app: PluginAppEntry;
  /** Set after the last install or uninstall request for this app failed. */
  failedAction: 'install' | 'uninstall' | null;
  isPending: boolean;
  isPinned: boolean;
  manageModulesHref: string;
  onInstall: (appId: NativeSecondaryAppId) => void;
  onTogglePin: (appId: NativeSecondaryAppId) => void;
  onUninstall: (appId: NativeSecondaryAppId) => void;
  subscriptionHref: string;
}

export interface PluginAppAccessNoteProps
  extends Pick<PluginAppRowProps, 'manageModulesHref' | 'subscriptionHref'> {
  state: PluginAppEntry['state'];
}
