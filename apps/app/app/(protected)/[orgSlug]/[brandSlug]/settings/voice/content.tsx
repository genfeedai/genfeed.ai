'use client';

import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import BrandDetailAgentProfileCard from '@pages/brands/components/sidebar/BrandDetailAgentProfileCard';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';

/**
 * Brand voice settings — full page form (no modal). Generate with AI or edit
 * fields directly; same surface as Agent Profile.
 */
export default function BrandSettingsVoicePage() {
  const { brand, brandId, hasBrandId, isLoading, handleRefreshBrand } =
    useBrandDetail();

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
    <BrandDetailAgentProfileCard
      brand={brand}
      brandId={brandId}
      onRefreshBrand={() => handleRefreshBrand(true)}
    />
  );
}
