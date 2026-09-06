'use client';

import { AssetCategory, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import BrandKitReviewCard from '@pages/brands/components/brand-kit/BrandKitReviewCard';
import BrandDetailManualKitCard from '@pages/brands/components/sidebar/BrandDetailManualKitCard';
import BrandDetailReferencesCard from '@pages/brands/components/sidebar/BrandDetailReferencesCard';
import BrandWatermarkSettings from '@pages/brands/components/sidebar/BrandWatermarkSettings';
import Card from '@ui/card/Card';
import BrandCompletenessCard from '@ui/cards/brand-completeness-card/BrandCompletenessCard';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { captureBrandOsFunnelStage } from '@/lib/analytics';

/**
 * Brand kit configuration — scan, manual draft, references, completeness.
 * Not part of the public profile surface.
 */
export default function BrandSettingsKitPage() {
  const translate = useTranslations('pages.brandKitSettings');
  const { href } = useOrgUrl();
  const {
    brand,
    brandId,
    hasBrandId,
    isLoading,
    deletingRefId,
    handleOpenUploadModal,
    handleRequestDeleteReference,
    handleRefreshBrand,
  } = useBrandDetail();

  if (!hasBrandId || isLoading) {
    return <Loading isFullSize={false} />;
  }

  if (!brand) {
    return (
      <Container>
        <Card>
          <p className="text-sm text-muted-foreground">
            {translate('brandMissing')}
          </p>
        </Card>
      </Container>
    );
  }

  return (
    <Container>
      <section
        aria-label="Brand Kit settings"
        className="mx-auto flex max-w-3xl flex-col gap-3"
        data-control-baseline="32px"
        data-scale-role="product"
      >
        <div className="flex flex-col gap-1 pb-1">
          <h2 className="text-sm font-semibold text-foreground">
            {translate('reviewTitle')}
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            {translate('reviewDescription')}
          </p>
        </div>

        <BrandCompletenessCard brand={brand} />

        <BrandKitReviewCard
          brand={brand}
          brandId={brandId}
          loadClaimedBrandOsDraft
          onBrandOsDraftAccepted={() =>
            captureBrandOsFunnelStage('draft_accepted')
          }
          onBrandOsDraftLoaded={() => captureBrandOsFunnelStage('draft_saved')}
          onRefreshBrand={() => handleRefreshBrand(true)}
        />

        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <h2 className="text-sm font-semibold text-foreground">
            {translate('manualAdjustments')}
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            {translate('manualDescription')}
          </p>
        </div>

        <BrandDetailManualKitCard
          brand={brand}
          brandId={brandId}
          onRefreshBrand={() => handleRefreshBrand(true)}
          onUploadBanner={() => handleOpenUploadModal(AssetCategory.BANNER)}
          onUploadLogo={() => handleOpenUploadModal(AssetCategory.LOGO)}
          onUploadReference={() =>
            handleOpenUploadModal(AssetCategory.REFERENCE)
          }
        />

        <BrandWatermarkSettings
          key={brandId}
          brand={brand}
          brandId={brandId}
          onRefreshBrand={() => handleRefreshBrand(true)}
        />

        <BrandDetailReferencesCard
          brand={brand}
          deletingRefId={deletingRefId}
          onUploadReference={() =>
            handleOpenUploadModal(AssetCategory.REFERENCE)
          }
          onDeleteReference={handleRequestDeleteReference}
        />

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold text-foreground">
                Brand Knowledge
              </h2>
              <p className="text-xs leading-5 text-muted-foreground">
                Save your website, docs and pasted material so generations cite
                them. Seed it from this Brand Kit in one click.
              </p>
            </div>
            <Button asChild variant={ButtonVariant.SECONDARY}>
              <Link href={href(APP_ROUTES.LIBRARY.KNOWLEDGE)}>
                <BookOpen className="size-4" />
                Open Knowledge
              </Link>
            </Button>
          </div>
        </Card>
      </section>
    </Container>
  );
}
