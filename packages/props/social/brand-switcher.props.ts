import type { Brand } from '@genfeedai/models/organization/brand.model';

export interface BrandSwitcherClearSelectionAction {
  ariaLabel?: string;
  onSelect: () => void;
}

export interface BrandSwitcherProps {
  brands: Brand[];
  brandId: string;
  clearSelectionAction?: BrandSwitcherClearSelectionAction;
  isUpdatingBrand?: boolean;
  onBrandChange?: (brandId: string) => void;
  variant?: 'avatar' | 'labeled';
}
