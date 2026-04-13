'use client';

import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import BrandDetailDefaultModelsCard from '@pages/brands/components/sidebar/BrandDetailDefaultModelsCard';
import BrandDetailIdentityCard from '@pages/brands/components/sidebar/BrandDetailIdentityCard';
import Card from '@ui/card/Card';
import Loading from '@ui/loading/default/Loading';

export default function BrandSettingsAgentDefaultsPage() {
  const { brand, brandId, hasBrandId, isLoading, handleRefreshBrand } =
    useBrandDetail();

  if (!hasBrandId || isLoading) {
    return <Loading isFullSize={false} />;
  }

  if (!brand) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Brand not found.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <BrandDetailIdentityCard
        brand={brand}
        brandId={brandId}
        onRefreshBrand={() => handleRefreshBrand(true)}
      />
      <BrandDetailDefaultModelsCard brand={brand} />
    </div>
  );
}
