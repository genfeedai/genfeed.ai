import type { Brand } from '@models/organization/brand.model';

export interface BrandCommandsProviderProps {
  brands: Brand[];
  brandId: string;
  onBrandChange?: (brandId: string) => void;
}
