'use client';

import {
  AssetCategory,
  AssetScope,
  ButtonVariant,
  ModalEnum,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  creatorProfilePath,
  GENFEED_BRAND_HANDLE,
  MODEL_KEYS,
  PUBLIC_ARTICLES_ORGANIZATION_SLUG,
} from '@genfeedai/contracts/constants';
import type { ILink } from '@genfeedai/contracts/interfaces';
import { isPublicAssetScope } from '@genfeedai/helpers';
import { openModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { useElements } from '@hooks/data/elements/use-elements/use-elements';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { EnvironmentService } from '@services/core/environment.service';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Container from '@ui/layout/container/Container';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import {
  LazyModalBrandGenerate,
  LazyModalBrandLink,
} from '@/components/lazy/modal/LazyModal';
import { useIsAppAvailable } from '@/components/shell/use-available-rail-apps';
import BrandDetailBanner from '@/features/brands/components/banner/BrandDetailBanner';
import BrandDetailSidebar from '@/features/brands/components/detail-sidebar/BrandDetailSidebar';
import BrandDetailOverview from '@/features/brands/components/overview/BrandDetailOverview';
import BrandDetailSocialMediaCard from '@/features/brands/components/sidebar/BrandDetailSocialMediaCard';
import { useBrandDetail } from '@/hooks/pages/use-brand-detail/use-brand-detail';
import BrandDetailPublicPosts from './BrandDetailPublicPosts';

/**
 * Brand profile surface — banner, logo, name/description, connected social
 * accounts (the Connect account modal, status, reconnect and per-account
 * settings), visibility, external links (inline + modal), and public posts with
 * their performance.
 */
export default function BrandDetail() {
  const translate = useTranslations('pages.brandSocialMedia');
  const [isConnectAccountModalOpen, setIsConnectAccountModalOpen] =
    useState(false);
  const {
    brand,
    hasBrandId,
    isLoading,
    brandId,
    posts,
    postsStatus,
    refetchPosts,
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
    handleUpdateHandle,
    handleOpenUploadModal,
    handleCopy,
    handleRefreshBrand,
    generateModalType,
    setGenerateModalType,
    selectLink,
  } = useBrandDetail();

  const { href } = useOrgUrl();
  const params = useRouteParams();
  const orgSlug = typeof params?.orgSlug === 'string' ? params.orgSlug : '';

  const handleOpenLinkModal = useCallback(
    (link?: ILink) => {
      selectLink(link ?? null);
      openModal(ModalEnum.BRAND_LINK);
    },
    [selectLink],
  );

  const handleLinkConfirm = useCallback(async () => {
    selectLink(null);
    await handleRefreshBrand();
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
    void handleRefreshBrand();
  };

  const handleCopyPublicProfile = () => {
    if (!brand?.slug) {
      return;
    }

    handleCopy(
      `${EnvironmentService.apps.website}${creatorProfilePath(brand.slug)}`,
    );
  };

  const isPublicProfile = isPublicAssetScope(brand?.scope);
  // Mirrors what genfeed.ai serves: a public brand's posts at its handle,
  // Genfeed's own organization at @genfeedai.
  const publicHandle =
    isPublicProfile && brand?.slug
      ? brand.slug
      : orgSlug === PUBLIC_ARTICLES_ORGANIZATION_SLUG
        ? GENFEED_BRAND_HANDLE
        : undefined;

  // One-off generation is Agent-first: Studio has no media prompt bar.
  const isAgentAvailable = useIsAppAvailable('agent');
  const createPostHref = isAgentAvailable
    ? `${EnvironmentService.apps.app}${href(APP_ROUTES.AGENT.NEW)}`
    : undefined;

  if (!hasBrandId) {
    return (
      <Container>
        <Alert variant="destructive">Error! Invalid brand ID.</Alert>
      </Container>
    );
  }

  return (
    <Container
      right={
        brand ? (
          <Button
            label={translate('connectAccount')}
            onClick={() => setIsConnectAccountModalOpen(true)}
            variant={ButtonVariant.DEFAULT}
          />
        ) : undefined
      }
    >
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
        <Alert variant="destructive">Error! Account not found.</Alert>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
            <div className="flex flex-col gap-6 md:col-span-8">
              <BrandDetailBanner
                brand={brand}
                isGeneratingBanner={isGeneratingBanner}
                onUploadBanner={() =>
                  handleOpenUploadModal(AssetCategory.BANNER)
                }
                onGenerateBanner={handleGenerateBanner}
              />

              <BrandDetailOverview
                brand={brand}
                isGeneratingLogo={isGeneratingLogo}
                onUploadLogo={() => handleOpenUploadModal(AssetCategory.LOGO)}
                onGenerateLogo={handleGenerateLogo}
                onUpdateBrand={(field, value) =>
                  handleUpdateAccount(field, value)
                }
                onUpdateHandle={handleUpdateHandle}
                onCopyPublicProfile={
                  isPublicProfile ? handleCopyPublicProfile : undefined
                }
              />

              <BrandDetailSocialMediaCard
                brandId={brandId}
                connectedPlatformsCount={connectedPlatformsCount}
                connections={socialConnections}
                isConnectAccountModalOpen={isConnectAccountModalOpen}
                onConnectAccountModalOpenChange={setIsConnectAccountModalOpen}
                onRefresh={() => handleRefreshBrand()}
                variant="page"
              />

              <BrandDetailPublicPosts
                createHref={createPostHref}
                onRetry={() => void refetchPosts()}
                posts={posts}
                publicHandle={publicHandle}
                status={postsStatus}
              />
            </div>

            <div className="md:col-span-4">
              <BrandDetailSidebar
                brand={brand}
                links={links}
                isUpdatingPublicProfile={isUpdating}
                onTogglePublicProfile={(isPublic) => {
                  // Fire-and-forget: the hook already reverts and toasts on failure.
                  void handleUpdateAccount(
                    'scope',
                    isPublic ? AssetScope.PUBLIC : AssetScope.BRAND,
                  ).catch(() => undefined);
                }}
                onOpenLinkModal={handleOpenLinkModal}
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
