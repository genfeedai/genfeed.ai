import type {
  NativeAppAvailabilityState,
  NativeSecondaryAppId,
  OrganizationModuleId,
} from '@genfeedai/contracts/constants';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { ReactNode } from 'react';

/** One native app in Apps (#5502), with its resolved state for the member. */
export interface AppCatalogEntry {
  appId: NativeSecondaryAppId;
  /** One line shown on the card. */
  description: string;
  /** What a member can do with the app, three short lines. */
  highlights: string[];
  icon: IconComponent;
  /** Installed for this member, whether or not access currently allows it. */
  isInstalled: boolean;
  label: string;
  /** Where the app opens for new work. */
  openHref: string;
  state: NativeAppAvailabilityState;
  /** Two sentences shown in the details sidebar. */
  summary: string;
}

/** Categories an app is filed under. */
export type AppCatalogCategoryId = 'create' | 'publish' | 'automate';

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

export type PluginThumbnailSize = 'card' | 'standard' | 'preview';

/** Apps-only presentation data for one native app, keyed by app id. */
export interface AppCatalogPresentation {
  art: PluginThumbnailArt;
  category: AppCatalogCategoryId;
  /** Real artwork; replaces the designed tile once an image exists. */
  thumbnailSrc?: string;
  tone: PluginThumbnailTone;
}

export interface AppCatalogThumbnailProps {
  appId: OrganizationModuleId;
  icon: IconComponent;
  label: string;
  size: PluginThumbnailSize;
}

export interface AppCatalogActionsProps {
  app: AppCatalogEntry;
  isPending: boolean;
  isPinned: boolean;
  onInstall: (appId: NativeSecondaryAppId) => void;
  onTogglePin: (appId: NativeSecondaryAppId) => void;
  onUninstall: (appId: NativeSecondaryAppId) => void;
}

export type AppCatalogStateProps = Pick<AppCatalogActionsProps, 'app'>;

export interface AppCatalogAccessNoteProps {
  manageModulesHref: string;
  subscriptionHref: string;
  state: AppCatalogEntry['state'];
}

/** Props for the grid card of one app. */
export interface AppCatalogItemProps {
  actions: ReactNode;
  app: AppCatalogEntry;
  categoryLabel: string;
  isSelected: boolean;
  onSelect: (appId: NativeSecondaryAppId) => void;
}

export interface AppCatalogDetailsPanelProps {
  /** Access explanation for an app the member cannot open. */
  accessNote: ReactNode;
  actions: ReactNode;
  /** `null` clears the selection and renders nothing. */
  app: AppCatalogEntry | null;
  categoryLabel: string;
  /** App-specific extras, such as the workflow library link. */
  children?: ReactNode;
  onClose: () => void;
}
