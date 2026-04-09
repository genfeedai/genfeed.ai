'use client';

import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import BrandDetailAgentProfileCard from '@pages/brands/components/sidebar/BrandDetailAgentProfileCard';
import Card from '@ui/card/Card';
import Loading from '@ui/loading/default/Loading';

export default function BrandSettingsVoicePage() {
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
    <BrandDetailAgentProfileCard
      brand={brand}
      brandId={brandId}
      onRefreshBrand={() => handleRefreshBrand(true)}
    />
  );
}
