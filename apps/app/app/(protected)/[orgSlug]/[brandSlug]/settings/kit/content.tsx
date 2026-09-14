'use client';

import { AssetCategory, MemberRole } from '@genfeedai/contracts';
import type { IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useUserRole } from '@hooks/auth/use-user-role/use-user-role';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import BrandKitReviewCard from '@pages/brands/components/brand-kit/BrandKitReviewCard';
import BrandOsSettingsCard from '@pages/brands/components/brand-kit/BrandOsSettingsCard';
import BrandDetailManualKitCard from '@pages/brands/components/sidebar/BrandDetailManualKitCard';
import BrandDetailReferencesCard from '@pages/brands/components/sidebar/BrandDetailReferencesCard';
import BrandWatermarkSettings from '@pages/brands/components/sidebar/BrandWatermarkSettings';
import { BrandsService } from '@services/social/brands.service';
import Card from '@ui/card/Card';
import BrandCompletenessCard from '@ui/cards/brand-completeness-card/BrandCompletenessCard';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { captureBrandOsFunnelStage } from '@/lib/analytics';

/**
 * Brand kit configuration — scan, manual draft, references, completeness.
 * Not part of the public profile surface.
 */
export default function BrandSettingsKitPage() {
  const translate = useTranslations('pages.brandKitSettings');
  const role = useUserRole();
  const canManage = role === MemberRole.OWNER || role === MemberRole.ADMIN;
  const [revisionRefreshKey, setRevisionRefreshKey] = useState(0);
  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
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

  async function persistRevision(draft: IBrandKitDraft) {
    const service = await getBrandsService();
    await service.createBrandOsRevision(brandId, draft);
    setRevisionRefreshKey((value) => value + 1);
  }

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
        aria-label={translate('settingsAriaLabel')}
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

        <BrandOsSettingsCard
          key={brandId}
          brandId={brandId}
          refreshKey={revisionRefreshKey}
          onRefreshBrand={() => handleRefreshBrand(true)}
        />

        {canManage && (
          <BrandKitReviewCard
            onDraftCreated={persistRevision}
            brand={brand}
            brandId={brandId}
            loadClaimedBrandOsDraft
            onBrandOsDraftAccepted={() =>
              captureBrandOsFunnelStage('draft_accepted')
            }
            onBrandOsDraftLoaded={() =>
              captureBrandOsFunnelStage('draft_saved')
            }
            onRefreshBrand={() => handleRefreshBrand(true)}
          />
        )}

        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <h2 className="text-sm font-semibold text-foreground">
            {translate('manualAdjustments')}
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            {translate('manualDescription')}
          </p>
        </div>

        {canManage && (
          <BrandDetailManualKitCard
            onDraftCreated={persistRevision}
            brand={brand}
            brandId={brandId}
            onRefreshBrand={() => handleRefreshBrand(true)}
            onUploadBanner={() => handleOpenUploadModal(AssetCategory.BANNER)}
            onUploadLogo={() => handleOpenUploadModal(AssetCategory.LOGO)}
            onUploadReference={() =>
              handleOpenUploadModal(AssetCategory.REFERENCE)
            }
          />
        )}

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
      </section>
    </Container>
  );
}
