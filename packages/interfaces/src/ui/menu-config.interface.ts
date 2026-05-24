import type { ComponentType, ReactNode } from 'react';
import type { ILabeledItem } from '../index';

export type AppContext =
  | 'workspace'
  | 'agent'
  | 'library'
  | 'posts'
  | 'studio'
  | 'workflows'
  | 'editor'
  | 'compose'
  | 'analytics';

export interface MenuItemConfig {
  href?: string;
  hrefScope?: 'brand' | 'organization' | 'personal';
  label: string;
  icon?: ReactNode;
  outline?: ComponentType<{ className?: string }>;
  solid?: ComponentType<{ className?: string }>;
  group?: string;
  matchPaths?: string[];
  /** Skip nested sidebar for this group — navigate directly on icon click */
  directNavigation?: boolean;
  /** When true on the first item of a group, the group renders as a single drill-down row with > chevron */
  drillDown?: boolean;
  /** When true, this item shows a "Coming Soon" badge and is not clickable */
  isComingSoon?: boolean;
  /** When true on the first item of a group, renders a visual divider above the group */
  hasDividerAbove?: boolean;
  /** When true, renders as a visually prominent CTA button */
  isPrimary?: boolean;
  /** Marks runtime-generated items (e.g. connected credentials) */
  isDynamic?: boolean;
  /** Associated credential ID for dynamic items */
  credentialId?: string;
  /** When true, this item is only visible when isAdvancedMode is enabled */
  advancedOnly?: boolean;
}

export interface MenuConfig {
  items: MenuItemConfig[];
  logoHref: string;
  isAppDropdownEnabled?: boolean;
  isBrandDropdownEnabled?: boolean;
  isReturnButtonEnabled?: boolean;
  accounts?: ILabeledItem[];
  brandId?: string;
  onBrandChange?: (brandId: string) => void;
}
