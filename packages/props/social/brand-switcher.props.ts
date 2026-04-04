import type { Brand } from '@models/organization/brand.model';

export interface BrandSwitcherProps {
  brands: Brand[];
  brandId: string;
  isUpdatingBrand?: boolean;
  onBrandChange?: (brandId: string) => void;
}
