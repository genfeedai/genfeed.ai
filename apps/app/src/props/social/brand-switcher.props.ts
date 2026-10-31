import type { Brand } from '@genfeedai/models/organization/brand.model';

export interface BrandSwitcherClearSelectionAction {
  ariaLabel?: string;
  onSelect: () => void;
}

export interface BrandSwitcherProps {
  brands: Brand[];
  brandId: string;
  clearSelectionAction?: BrandSwitcherClearSelectionAction;
  compactOnMobile?: boolean;
  isUpdatingBrand?: boolean;
  onBrandChange?: (brandId: string) => void;
  /** A logo failed to load; the owner refreshes the brand list to re-sign it. */
  onLogoError?: () => void;
  variant?: 'avatar' | 'labeled';
}
