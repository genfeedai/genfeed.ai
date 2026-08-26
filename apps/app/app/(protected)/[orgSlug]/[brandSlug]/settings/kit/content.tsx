'use client';

import { AssetCategory } from '@genfeedai/enums';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import BrandKitReviewCard from '@pages/brands/components/brand-kit/BrandKitReviewCard';
import BrandDetailManualKitCard from '@pages/brands/components/sidebar/BrandDetailManualKitCard';
import BrandDetailReferencesCard from '@pages/brands/components/sidebar/BrandDetailReferencesCard';
import Card from '@ui/card/Card';
import BrandCompletenessCard from '@ui/cards/brand-completeness-card/BrandCompletenessCard';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';

/**
 * Brand kit configuration — scan, manual draft, references, completeness.
 * Not part of the public profile surface.
 */
export default function BrandSettingsKitPage() {
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
          <p className="text-sm text-muted-foreground">Brand not found.</p>
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
            Review brand evidence
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            Review extracted and inferred evidence before accepting it.
            Candidate colors stay separate from Genfeed product tokens.
          </p>
        </div>

        <BrandCompletenessCard brand={brand} />

        <BrandKitReviewCard
          brand={brand}
          brandId={brandId}
          onRefreshBrand={() => handleRefreshBrand(true)}
        />

        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <h2 className="text-sm font-semibold text-foreground">
            Manual adjustments
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            Add owned guidance and reference assets after reviewing the scan.
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

        <BrandDetailReferencesCard
          brand={brand}
          deletingRefId={deletingRefId}
          onUploadReference={() =>
            handleOpenUploadModal(AssetCategory.REFERENCE)
          }
          onDeleteReference={handleRequestDeleteReference}
        />
      </section>
    </Container>
  );
}
