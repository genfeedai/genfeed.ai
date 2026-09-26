import type {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/contracts';
import {
  BentoRowSpan,
  BentoSize,
  BentoSpan,
  BentoVariant,
  CardVariant,
} from '@genfeedai/contracts';
import type { NavigationTab } from '@genfeedai/contracts/interfaces/ui/navigation.interface';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { PageHelpContent } from '@genfeedai/props/ui/layout/page-help.props';
import type { TabItem, TabsProps } from '@props/ui/navigation/tabs.props';
import type { MouseEvent, ReactNode } from 'react';

export { BentoRowSpan, BentoSize, BentoSpan, BentoVariant, CardVariant };

export interface AlertProps {
  type?: AlertCategory;
  className?: string;
  children: ReactNode;
  icon?: ReactNode;
  onClose?: () => void;
}

export interface BadgeFormatProps {
  format?: string;
  className?: string;
}

export interface CardProps {
  /** One skeleton inside the frame while initial data is pending. */
  isLoading?: boolean;
  loadingLabel?: string;
  index?: number;
  variant?: CardVariant;
  children?: ReactNode;
  actions?: ReactNode;
  headerAction?: ReactNode;
  figure?: string;
  overlay?: string;
  className?: string;
  bodyClassName?: string;
  icon?: IconComponent | ReactNode;
  iconWrapperClassName?: string;
  iconClassName?: string;
  id?: string;
  label?: ReactNode;
  description?: string;
  isDisabled?: boolean;
  onClick?: () => void;
  onDescriptionClick?: () => void;
  'data-testid'?: string;
}

export interface CardIconProps {
  icon: IconComponent | ReactNode;
  className?: string;
  iconClassName?: string;
  label?: string;
}

export interface ContainerProps {
  label?: ReactNode;
  description?: ReactNode;
  icon?: IconComponent | ReactNode;
  titleVisibility?: 'visible' | 'sr-only';
  tabs?: TabItem[] | NavigationTab[];
  headerTabs?: TabsProps;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
  fullWidth?: boolean;
  left?: ReactNode;
  /** Left-aligned module-bar tools such as search. Maps to SectionTopbar `leading`. */
  leading?: ReactNode;
  right?: ReactNode;
  /** Explicit help popover; `null` hides the route-level help for this page. */
  help?: PageHelpContent | null;
  /**
   * Declare, once per page, whether this route always uses module-local
   * chrome (`SectionTopbar`) — independent of whether `right` / `tabs` /
   * `headerTabs` / `leading` happen to be populated on a given render.
   *
   * Without this, Container infers its layout from those props, which flips
   * structure (and reflows the page) whenever a page's loading, error, and
   * loaded states populate them differently — e.g. a detail shell that only
   * adds `headerTabs` once data has loaded. Pages with that shape should
   * pass the same `moduleChrome` value on every branch/render instead of
   * relying on the heuristic.
   *
   * Leave unset to keep the default heuristic, which is correct for pages
   * whose header content is naturally stable across their lifecycle.
   */
  moduleChrome?: boolean;
}

export interface LinkProps {
  url: string;
  label?: ReactNode;
  icon?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  isLoading?: boolean;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  tooltip?: string;
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
  target?: '_blank' | '_self' | '_parent' | '_top';
  rel?: string;
}

export interface BentoItemProps {
  span?: BentoSpan;
  rowSpan?: BentoRowSpan;
  variant?: BentoVariant;
  size?: BentoSize;
  className?: string;
  children: ReactNode;
}

export interface BentoGridProps {
  columns?: 2 | 3 | 4;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
  children: ReactNode;
}

export interface DashboardGridProps {
  cols?: 2 | 4;
  className?: string;
  children: ReactNode;
}

export interface MarqueeRailProps {
  children: ReactNode;
  className?: string;
  /**
   * Space between items, in pixels. Applied inside each copy of the row rather
   * than as a class, because the seam only lands exactly when the gap is part
   * of a copy's own width.
   */
  gapPx?: number;
}

export interface HorizontalCarouselProps {
  gap?: 'sm' | 'md' | 'lg';
  showNavigation?: boolean;
  className?: string;
  itemClassName?: string;
  children: ReactNode;
}
