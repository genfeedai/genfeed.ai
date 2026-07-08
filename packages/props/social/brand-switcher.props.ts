import type { Brand } from '@genfeedai/models/organization/brand.model';

export interface BrandSwitcherOrganizationScopeOption {
  isActive?: boolean;
  label: string;
  onSelect: () => void;
}

export interface BrandSwitcherProps {
  brands: Brand[];
  brandId: string;
  isUpdatingBrand?: boolean;
  onBrandChange?: (brandId: string) => void;
  organizationScopeOption?: BrandSwitcherOrganizationScopeOption;
  variant?: 'avatar' | 'labeled';
}
