import type {
  NativeAppAvailabilityState,
  NativeSecondaryAppId,
  OrganizationModuleId,
} from '@genfeedai/contracts/constants';
import type { IconComponent } from '@genfeedai/contracts/types/icon';

/** One native app in the Store (#5502), with its resolved state for the member. */
export interface ExploreAppEntry {
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
export type ExploreCategoryId = 'create' | 'publish' | 'automate';

export type ExploreFilterId = 'all' | ExploreCategoryId;

/** Abstract mini-illustration drawn on an app's thumbnail. */
export type ExploreThumbnailArt =
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

export type ExploreThumbnailTone = 'info' | 'primary' | 'success' | 'warning';

export type ExploreThumbnailSize = 'compact' | 'featured' | 'standard';

/** Store-only presentation data for one native app, keyed by app id. */
export interface ExploreAppCatalogEntry {
  art: ExploreThumbnailArt;
  category: ExploreCategoryId;
  isFeatured: boolean;
  /** Real artwork; replaces the designed tile once an image exists. */
  thumbnailSrc?: string;
  tone: ExploreThumbnailTone;
}

export interface ExploreAppThumbnailProps {
  appId: OrganizationModuleId;
  icon: IconComponent;
  label: string;
  size: ExploreThumbnailSize;
}

export interface ExploreAppCardProps {
  app: ExploreAppEntry;
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

export interface ExploreAppAccessNoteProps
  extends Pick<ExploreAppCardProps, 'manageModulesHref' | 'subscriptionHref'> {
  state: ExploreAppEntry['state'];
}
