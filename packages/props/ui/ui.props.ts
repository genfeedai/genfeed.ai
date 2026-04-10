import type {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/enums';
import {
  BentoRowSpan,
  BentoSize,
  BentoSpan,
  BentoVariant,
  CardVariant,
} from '@genfeedai/enums';
import type { NavigationTab } from '@genfeedai/interfaces/ui/navigation.interface';
import type { TabItem, TabsProps } from '@props/ui/navigation/tabs.props';
import type { ComponentType, MouseEvent, ReactNode } from 'react';

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
  index?: number;
  variant?: CardVariant;
  children?: ReactNode;
  actions?: ReactNode;
  headerAction?: ReactNode;
  figure?: string;
  overlay?: string;
  className?: string;
  bodyClassName?: string;
  icon?: ComponentType<{ className?: string }>;
  iconWrapperClassName?: string;
  iconClassName?: string;
  label?: ReactNode;
  description?: string;
  onClick?: () => void;
}

export interface CardIconProps {
  icon: ComponentType<{ className?: string }> | ReactNode;
  className?: string;
  iconClassName?: string;
  label?: string;
}

export interface ContainerProps {
  label?: ReactNode;
  description?: ReactNode;
  icon?: ComponentType<{ className?: string }> | ReactNode;
  tabs?: TabItem[] | NavigationTab[];
  headerTabs?: TabsProps;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  children: ReactNode;
  className?: string;
  left?: ReactNode;
  right?: ReactNode;
  topbarRight?: ReactNode;
  promoteHeaderToTopbarOnScroll?: boolean;
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

export interface HorizontalCarouselProps {
  gap?: 'sm' | 'md' | 'lg';
  showNavigation?: boolean;
  className?: string;
  itemClassName?: string;
  children: ReactNode;
}
