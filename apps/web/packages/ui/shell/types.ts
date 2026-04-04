import type {
  MenuConfig,
  MenuItemConfig,
} from '@genfeedai/interfaces/ui/menu-config.interface';

export interface ShellAction {
  id: string;
  label: string;
  href?: string;
}

export interface BrandConfig {
  isBrandDropdownEnabled?: boolean;
  logoHref: string;
}

export interface SidebarConfig extends MenuConfig {}

export interface PublicTopbarLink {
  href: string;
  label: string;
}

export interface PublicTopbarDropdownItem {
  description?: string;
  href: string;
  label: string;
}

export interface PublicTopbarDropdown {
  items: PublicTopbarDropdownItem[];
  label: string;
}

export interface TopbarConfig {
  navLinks?: PublicTopbarLink[];
  dropdowns?: PublicTopbarDropdown[];
  rootLabel?: string;
}

export interface ShellConfig {
  brand?: BrandConfig;
  sidebar?: SidebarConfig;
  topbar?: TopbarConfig;
}

export interface ShellNavItem extends MenuItemConfig {}
