'use client';

import {
  AlertCategory,
  AssetCategory,
  AssetScope,
  ModalEnum,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { ILink } from '@genfeedai/contracts/interfaces';
import { isPublicAssetScope } from '@genfeedai/helpers';
import { openModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useElements } from '@hooks/data/elements/use-elements/use-elements';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import BrandDetailBanner from '@pages/brands/components/banner/BrandDetailBanner';
import BrandDetailSidebar from '@pages/brands/components/detail-sidebar/BrandDetailSidebar';
import BrandDetailOverview from '@pages/brands/components/overview/BrandDetailOverview';
import { EnvironmentService } from '@services/core/environment.service';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import {
  LazyModalBrandGenerate,
  LazyModalBrandLink,
} from '@ui/lazy/modal/LazyModal';
import { useParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import BrandDetailLatestArticles from './BrandDetailLatestArticles';
import BrandDetailLatestImages from './BrandDetailLatestImages';
import BrandDetailLatestVideos from './BrandDetailLatestVideos';

/**
 * Brand public profile surface — banner, logo, name/description, visibility,
 * external links (inline + modal), and latest public content.
 * OAuth accounts live on /settings/social.
 */
export default function BrandDetail() {
  const {
    brand,
    hasBrandId,
    isLoading,
    brandId,
    videos,
    images,
    articles,
    links,
    selectedLink,
    isGeneratingBanner,
    isGeneratingLogo,
    isUpdating,
    socialConnections,
    connectedPlatformsCount,
    handleGenerateBanner,
    handleGenerateLogo,
    handleUpdateAccount,
    handleOpenUploadModal,
    handleCopy,
    handleRefreshBrand,
    generateModalType,
    setGenerateModalType,
    selectLink,
  } = useBrandDetail();

  const params = useParams();
  const orgSlug = typeof params?.orgSlug === 'string' ? params.orgSlug : '';
  const brandSlug =
    typeof params?.brandSlug === 'string' ? params.brandSlug : '';
  const manageSocialHref =
    orgSlug && brandSlug
      ? `/${orgSlug}/${brandSlug}/settings/social`
      : '/settings/social';

  const handleOpenLinkModal = useCallback(
    (link?: ILink) => {
      selectLink(link ?? null);
      openModal(ModalEnum.BRAND_LINK);
    },
    [selectLink],
  );

  const handleLinkConfirm = useCallback(async () => {
    selectLink(null);
    await handleRefreshBrand(true);
  }, [handleRefreshBrand, selectLink]);

  const { imageModels } = useElements();

  const generateCost = useMemo(() => {
    if (!brand || !generateModalType) {
      return 5;
    }
    const modelToUse =
      brand.defaultImageModel || MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_FAST;
    const model = imageModels.find((m) => m.key === modelToUse);
    return model?.cost || 5;
  }, [brand, generateModalType, imageModels]);

  const handleGenerateConfirm = () => {
    setGenerateModalType(null);
    void handleRefreshBrand(true);
  };

  const handleCopyPublicProfile = () => {
    if (!brand?.slug) {
      return;
    }

    handleCopy(`${EnvironmentService.apps.website}/u/${brand.slug}`);
  };

  const isPublicProfile = isPublicAssetScope(brand?.scope);

  if (!hasBrandId) {
    return (
      <Container>
        <Alert type={AlertCategory.ERROR}>Error! Invalid brand ID.</Alert>
      </Container>
    );
  }

  return (
    <Container>
      {isLoading ? (
        <div className="flex flex-col gap-8" data-testid="brand-detail-loading">
          <SkeletonCard showImage />
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
            <div className="flex flex-col gap-6 md:col-span-8">
              <SkeletonCard showImage={false} />
              <SkeletonCard showImage={false} />
            </div>
            <div className="md:col-span-4">
              <SkeletonCard showImage={false} />
            </div>
          </div>
        </div>
      ) : !brand ? (
        <Alert type={AlertCategory.ERROR}>Error! Account not found.</Alert>
      ) : (
        <>
          <BrandDetailBanner
            brand={brand}
            isGeneratingBanner={isGeneratingBanner}
            onUploadBanner={() => handleOpenUploadModal(AssetCategory.BANNER)}
            onGenerateBanner={handleGenerateBanner}
          />

          <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
            <div className="flex flex-col gap-6 md:col-span-8">
              <BrandDetailOverview
                brand={brand}
                isGeneratingLogo={isGeneratingLogo}
                onUploadLogo={() => handleOpenUploadModal(AssetCategory.LOGO)}
                onGenerateLogo={handleGenerateLogo}
                onUpdateBrand={(field, value) =>
                  handleUpdateAccount(field, value)
                }
                onCopyPublicProfile={
                  isPublicProfile ? handleCopyPublicProfile : undefined
                }
              />

              <BrandDetailLatestVideos videos={videos} />
              <BrandDetailLatestImages images={images} />
              <BrandDetailLatestArticles articles={articles} />
            </div>

            <div className="md:col-span-4">
              <BrandDetailSidebar
                brand={brand}
                brandId={brandId}
                links={links}
                socialConnections={socialConnections}
                connectedPlatformsCount={connectedPlatformsCount}
                deletingRefId={null}
                isUpdatingPublicProfile={isUpdating}
                manageSocialHref={manageSocialHref}
                onTogglePublicProfile={(isPublic) => {
                  // Fire-and-forget: the hook already reverts and toasts on failure.
                  void handleUpdateAccount(
                    'scope',
                    isPublic ? AssetScope.PUBLIC : AssetScope.BRAND,
                  ).catch(() => undefined);
                }}
                onRefreshBrand={async () => {
                  await handleRefreshBrand(true);
                }}
                onOpenLinkModal={handleOpenLinkModal}
                onUploadBanner={() =>
                  handleOpenUploadModal(AssetCategory.BANNER)
                }
                onUploadLogo={() => handleOpenUploadModal(AssetCategory.LOGO)}
                onUploadReference={() =>
                  handleOpenUploadModal(AssetCategory.REFERENCE)
                }
                onDeleteReference={() => undefined}
              />
            </div>
          </div>

          <LazyModalBrandGenerate
            type={generateModalType || 'banner'}
            cost={generateCost}
            brandId={brandId}
            onConfirm={handleGenerateConfirm}
          />

          <LazyModalBrandLink
            brandId={brandId}
            link={selectedLink}
            onConfirm={handleLinkConfirm}
          />
        </>
      )}
    </Container>
  );
}
