'use client';

import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import BrandDetailSocialMediaCard from '@pages/brands/components/sidebar/BrandDetailSocialMediaCard';
import BrandSocialHistoryImportCard from '@pages/brands/components/sidebar/BrandSocialHistoryImportCard';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { useTranslations } from 'next-intl';

/**
 * Brand Integrations settings — OAuth / connected platform accounts only.
 * External website links live on Brand Profile via ModalBrandLink.
 */
export default function BrandSettingsIntegrationsPage() {
  const translate = useTranslations('pages.brandSocialMedia');
  const {
    brand,
    brandId,
    handleRefreshBrand,
    hasBrandId,
    isLoading,
    socialConnections,
    connectedPlatformsCount,
  } = useBrandDetail();

  if (!hasBrandId || isLoading) {
    return <Loading isFullSize={false} />;
  }

  if (!brand) {
    return (
      <Container>
        <Card>
          <p className="text-sm text-muted-foreground">
            {translate('brandNotFound')}
          </p>
        </Card>
      </Container>
    );
  }

  return (
    <Container>
      <div className="mx-auto flex max-w-5xl flex-col gap-3">
        <BrandSocialHistoryImportCard
          brand={brand}
          brandId={brandId}
          onRefreshBrand={() => handleRefreshBrand(true)}
        />
        <BrandDetailSocialMediaCard
          brandId={brandId}
          connections={socialConnections}
          connectedPlatformsCount={connectedPlatformsCount}
          onRefresh={() => handleRefreshBrand(true)}
          variant="page"
        />
      </div>
    </Container>
  );
}
