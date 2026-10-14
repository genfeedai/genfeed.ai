import type {
  NativeAppAvailabilityState,
  NativeSecondaryAppId,
  OrganizationModuleId,
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

/** Store shelves an app is filed under; the filter chips mirror these. */
export type StoreCategoryId = 'create' | 'publish' | 'automate';

export type StoreFilterId = 'all' | StoreCategoryId;

/** Abstract mini-illustration drawn on an app's thumbnail. */
export type StoreThumbnailArt =
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

export type StoreThumbnailTone = 'info' | 'primary' | 'success' | 'warning';

export type StoreThumbnailSize = 'compact' | 'featured' | 'standard';

/** Store-only presentation data for one native app, keyed by app id. */
export interface StoreAppCatalogEntry {
  art: StoreThumbnailArt;
  category: StoreCategoryId;
  isFeatured: boolean;
  /** Real artwork; replaces the designed tile once an image exists. */
  thumbnailSrc?: string;
  tone: StoreThumbnailTone;
}

export interface StoreAppThumbnailProps {
  appId: OrganizationModuleId;
  icon: IconComponent;
  label: string;
  size: StoreThumbnailSize;
}

export interface StoreAppCardProps {
  app: StoreAppEntry;
  /** `featured` is the larger hero card; the testid prefix keeps both findable. */
  variant?: 'featured' | 'standard';
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

export interface StoreAppAccessNoteProps
  extends Pick<StoreAppCardProps, 'manageModulesHref' | 'subscriptionHref'> {
  state: StoreAppEntry['state'];
}
