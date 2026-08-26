'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import CostUsagePage from '@/features/settings/cost-usage/CostUsagePage';

export default function BrandSettingsCostUsagePage() {
  const { brandId } = useBrand();
  if (!brandId) {
    return <LazyLoadingFallback variant="grid" />;
  }
  return <CostUsagePage lockedBrandId={brandId} />;
}
