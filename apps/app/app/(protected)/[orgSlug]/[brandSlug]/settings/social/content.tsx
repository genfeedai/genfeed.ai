'use client';

import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import BrandDetailSocialMediaCard from '@pages/brands/components/sidebar/BrandDetailSocialMediaCard';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';

/**
 * Brand Social settings — OAuth / connected platform accounts only.
 * External website links live at /settings/links.
 */
export default function BrandSettingsSocialPage() {
  const {
    brand,
    brandId,
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
          <p className="text-sm text-muted-foreground">Brand not found.</p>
        </Card>
      </Container>
    );
  }

  return (
    <Container>
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <BrandDetailSocialMediaCard
          brandId={brandId}
          connections={socialConnections}
          connectedPlatformsCount={connectedPlatformsCount}
        />
      </div>
    </Container>
  );
}
