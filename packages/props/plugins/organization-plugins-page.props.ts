import type {
  NativeAppAvailabilityState,
  NativeSecondaryAppId,
  OrganizationModuleId,
} from '@genfeedai/contracts/constants';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { ReactNode } from 'react';

/** One native app in Plugins (#5502), with its resolved state for the member. */
export interface PluginAppEntry {
  appId: NativeSecondaryAppId;
  /** One line shown on the card and list row. */
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

export type PluginThumbnailSize = 'card' | 'compact' | 'standard' | 'preview';

export type PluginStatusFilter =
  | 'all'
  | 'installed'
  | 'available'
  | 'restricted';

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

export interface PluginAppActionsProps {
  app: PluginAppEntry;
  isPending: boolean;
  isPinned: boolean;
  onInstall: (appId: NativeSecondaryAppId) => void;
  onTogglePin: (appId: NativeSecondaryAppId) => void;
  onUninstall: (appId: NativeSecondaryAppId) => void;
}

export type PluginAppStateProps = Pick<PluginAppActionsProps, 'app'>;

export interface PluginAppAccessNoteProps {
  manageModulesHref: string;
  subscriptionHref: string;
  state: PluginAppEntry['state'];
}

/** Props shared by the grid card and the list row of one plugin app. */
export interface PluginAppItemProps {
  actions: ReactNode;
  app: PluginAppEntry;
  categoryLabel: string;
  isSelected: boolean;
  onSelect: (appId: NativeSecondaryAppId) => void;
}

export interface PluginAppDetailsPanelProps {
  /** Access explanation for an app the member cannot open. */
  accessNote: ReactNode;
  actions: ReactNode;
  /** `null` clears the selection and renders nothing. */
  app: PluginAppEntry | null;
  categoryLabel: string;
  /** App-specific extras, such as the workflow library link. */
  children?: ReactNode;
  onClose: () => void;
}
