import type { Brand } from '@models/organization/brand.model';

export interface SidebarHeaderProps {
  /** URL for the logo image */
  logoUrl?: string;
  /** Link destination for the logo */
  logoHref: string;
  /** Whether the sidebar is collapsed */
  isCollapsed?: boolean;
  /** Callback to toggle collapse state */
  onToggleCollapse?: () => void;
  /** Whether to show the brand switcher */
  showBrandSwitcher?: boolean;
  /** List of brands for the switcher */
  brands?: Brand[];
  /** Currently selected brand ID */
  brandId?: string;
  /** Callback when brand is changed */
  onBrandChange?: (brandId: string) => void;
  /** Whether brand is being updated */
  isUpdatingBrand?: boolean;
}
