'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import CostUsagePage from '@/features/settings/cost-usage/CostUsagePage';

export default function BrandSettingsCostUsagePage() {
  const { brandId } = useBrand();
  if (!brandId) {
    return null;
  }
  return <CostUsagePage lockedBrandId={brandId} />;
}
