import type { ReactNode } from 'react';
import type { IconComponent } from '../../types/icon';
import type { IconType } from './icon.interface';

export interface INavigationItem {
  id: string;
  label: string;
  href?: string;
  icon?: IconType | ReactNode;
  badge?: string | number;
  disabled?: boolean;
}

export interface IMenuItem extends INavigationItem {
  children?: IMenuItem[];
  separator?: boolean;
  onClick?: () => void;
  target?: '_self' | '_blank';
  rel?: string;
}

export interface INavLink extends INavigationItem {
  isActive?: boolean;
  exact?: boolean;
  prefetch?: boolean;
}

export interface AppLink {
  href: string;
  label: string;
  icon: ReactNode;
  description: string;
  category: 'main' | 'creative' | 'admin';
  shortcut?: string[];
}

export interface NavigationTab {
  href: string;
  label: string;
  icon?: IconComponent;
  isDisabled?: boolean;
  badge?: ReactNode;
}

/** A platform filter tab: the "All" entry or one publishing platform. */
export interface IPlatformTab {
  icon: IconComponent;
  id: string;
  label: string;
}
