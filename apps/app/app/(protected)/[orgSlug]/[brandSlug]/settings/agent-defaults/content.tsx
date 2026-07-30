'use client';

import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import BrandDetailAgentProfileCard from '@pages/brands/components/sidebar/BrandDetailAgentProfileCard';
import BrandDetailDefaultModelsCard from '@pages/brands/components/sidebar/BrandDetailDefaultModelsCard';
import BrandDetailIdentityCard from '@pages/brands/components/sidebar/BrandDetailIdentityCard';
import BrandDetailSystemPrompt from '@pages/brands/components/system-prompt/BrandDetailSystemPrompt';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';

export default function BrandSettingsAgentDefaultsPage() {
  const {
    brand,
    brandId,
    hasBrandId,
    isLoading,
    handleCopy,
    handleRefreshBrand,
  } = useBrandDetail();

  if (!hasBrandId || isLoading) {
    return <Loading isFullSize={false} />;
  }

  if (!brand) {
    return (
      <Container>
        <Card>
          <p className="text-sm text-muted-foreground">Brand not found.</p>
        </Card>
      </Container>
    );
  }

  return (
    <Container>
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <BrandDetailIdentityCard
          brand={brand}
          brandId={brandId}
          onRefreshBrand={() => handleRefreshBrand(true)}
        />
        <BrandDetailDefaultModelsCard brand={brand} />
        <BrandDetailAgentProfileCard
          brand={brand}
          brandId={brandId}
          onRefreshBrand={() => handleRefreshBrand(true)}
        />
        {brand.text ? (
          <BrandDetailSystemPrompt text={brand.text} onCopy={handleCopy} />
        ) : null}
      </div>
    </Container>
  );
}
