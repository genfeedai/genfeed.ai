'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import CostUsagePage from '@/features/settings/cost-usage/CostUsagePage';

export default function BrandSettingsCostUsagePage() {
  const { brandId } = useBrand();
  if (!brandId) {
    return <PageLoadingState />;
  }
  return <CostUsagePage lockedBrandId={brandId} />;
}
