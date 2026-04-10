import type { Brand } from '@genfeedai/models/organization/brand.model';

export interface BrandSwitcherProps {
  brands: Brand[];
  brandId: string;
  isUpdatingBrand?: boolean;
  onBrandChange?: (brandId: string) => void;
}
