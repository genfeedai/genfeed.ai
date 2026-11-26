'use client';

import {
  AssetCategory,
  AssetScope,
  ButtonSize,
  ButtonVariant,
  ModalEnum,
} from '@genfeedai/contracts';
import { creatorProfilePath, MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { ILink } from '@genfeedai/contracts/interfaces';
import { isPublicAssetScope } from '@genfeedai/helpers';
import { openModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useElements } from '@hooks/data/elements/use-elements/use-elements';
import { EnvironmentService } from '@services/core/environment.service';
import CollectionSection from '@ui/collection/CollectionSection';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Container from '@ui/layout/container/Container';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { UnderlineNav } from '@ui/primitives/underline-nav';
import { Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import {
  LazyModalBrandGenerate,
  LazyModalBrandLink,
} from '@/components/lazy/modal/LazyModal';
import BrandProfileArticles from '@/features/brands/components/articles/BrandProfileArticles';
import BrandDetailBanner from '@/features/brands/components/banner/BrandDetailBanner';
import BrandDetailOverview from '@/features/brands/components/overview/BrandDetailOverview';
import BrandProfileStats from '@/features/brands/components/overview/BrandProfileStats';
import BrandDetailExternalLinksCard from '@/features/brands/components/sidebar/BrandDetailExternalLinksCard';
import BrandDetailSocialMediaCard from '@/features/brands/components/sidebar/BrandDetailSocialMediaCard';
import BrandProfileVisibility from '@/features/brands/components/visibility/BrandProfileVisibility';
import BrandPublicAnalyticsSetting from '@/features/brands/components/visibility/BrandPublicAnalyticsSetting';
import { useBrandProfileArticles } from '@/features/brands/hooks/use-brand-profile-articles';
import { useBrandReach } from '@/features/brands/hooks/use-brand-reach';
import { useBrandDetail } from '@/hooks/pages/use-brand-detail/use-brand-detail';

type ProfileTab = 'articles' | 'settings';

/**
 * The brand profile, laid out like the public page at genfeed.ai/@handle: the
 * banner, the header (picture, name, handle, description, one visibility
 * control, the stats line), then Articles and Settings tabs. Settings carries
 * what only the owner needs on top of the public view: the Public analytics
 * switch, the connected accounts (the Connect account modal, status, reconnect
 * and per-account settings) and website links. A `?tab=` that names no tab
 * (the old `overview`) shows Articles.
 */
export default function BrandDetail() {
  const translate = useTranslations('pages.brandSocialMedia');
  const translateOverview = useTranslations('pages.brandDetailOverview');
  const [isConnectAccountModalOpen, setIsConnectAccountModalOpen] =
    useState(false);
  const {
    brand,
    hasBrandId,
    isLoading,
    brandId,
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

  const searchParams = useSearchParams();
  const activeTab: ProfileTab =
    searchParams?.get('tab') === 'settings' ? 'settings' : 'articles';
  const currentPage = Number(searchParams?.get('page')) || 1;
  const {
    articles,
    isError: isArticlesError,
    isPending: isArticlesPending,
    total: articlesTotal,
  } = useBrandProfileArticles(
    brandId,
    activeTab === 'articles' ? currentPage : 1,
  );
  const reach = useBrandReach(brandId);

  // Next syncs a pushState URL into useSearchParams, so the tab changes with
  // no server round trip and the scroll position stays where it is.
  const selectTab = useCallback((tab: ProfileTab) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    url.searchParams.delete('page');
    window.history.pushState(null, '', url);
  }, []);

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

  const profileUrl = brand?.slug
    ? `${EnvironmentService.apps.website}${creatorProfilePath(brand.slug)}`
    : '';

  const handleCopyPublicProfile = () => {
    if (profileUrl) {
      handleCopy(profileUrl);
    }
  };

  const isPublicProfile = isPublicAssetScope(brand?.scope);

  if (!hasBrandId) {
    return (
      <Container>
        <Alert variant="destructive">Error! Invalid brand ID.</Alert>
      </Container>
    );
  }

  return (
    <Container>
      {isLoading ? (
        <div className="flex flex-col gap-6" data-testid="brand-detail-loading">
          <SkeletonCard showImage />
          <SkeletonCard showImage={false} />
          <SkeletonCard showImage={false} />
        </div>
      ) : !brand ? (
        <Alert variant="destructive">Error! Account not found.</Alert>
      ) : (
        <>
          <div className="flex flex-col gap-6">
            <BrandDetailBanner
              brand={brand}
              isGeneratingBanner={isGeneratingBanner}
              onUploadBanner={() => handleOpenUploadModal(AssetCategory.BANNER)}
              onGenerateBanner={handleGenerateBanner}
            />

            <BrandDetailOverview
              brand={brand}
              footer={
                <BrandProfileStats accounts={socialConnections} reach={reach} />
              }
              isAvatarOverlapping
              isGeneratingLogo={isGeneratingLogo}
              onGenerateLogo={handleGenerateLogo}
              onUpdateBrand={(field, value) =>
                handleUpdateAccount(field, value)
              }
              onUpdateHandle={handleUpdateHandle}
              onUploadLogo={() => handleOpenUploadModal(AssetCategory.LOGO)}
              visibility={
                <BrandProfileVisibility
                  isPublic={isPublicProfile}
                  isUpdating={isUpdating}
                  onCopy={handleCopyPublicProfile}
                  onToggle={(isPublic) => {
                    // Fire-and-forget: the hook already reverts and toasts on failure.
                    void handleUpdateAccount(
                      'scope',
                      isPublic ? AssetScope.PUBLIC : AssetScope.BRAND,
                    ).catch(() => undefined);
                  }}
                  profileUrl={profileUrl}
                />
              }
            />

            <UnderlineNav
              ariaLabel={translateOverview('profileSections')}
              items={[
                {
                  badge: (
                    <span className="text-foreground/40">{articlesTotal}</span>
                  ),
                  href: '?tab=articles',
                  isActive: activeTab === 'articles',
                  label: translateOverview('articlesTab'),
                  onSelect: () => selectTab('articles'),
                },
                {
                  href: '?tab=settings',
                  isActive: activeTab === 'settings',
                  label: translateOverview('settingsTab'),
                  onSelect: () => selectTab('settings'),
                },
              ]}
            />

            {activeTab === 'settings' ? (
              <div className="flex flex-col gap-12">
                <BrandPublicAnalyticsSetting
                  isEnabled={brand.isPublicAnalyticsEnabled !== false}
                  isUpdating={isUpdating}
                  onToggle={(isEnabled) => {
                    // Fire-and-forget: the hook already reverts and toasts on failure.
                    void handleUpdateAccount(
                      'isPublicAnalyticsEnabled',
                      isEnabled,
                    ).catch(() => undefined);
                  }}
                />

                <CollectionSection
                  actions={
                    <Button
                      icon={<Plus className="size-3.5" />}
                      label={translate('connectAccount')}
                      onClick={() => setIsConnectAccountModalOpen(true)}
                      size={ButtonSize.XS}
                      variant={ButtonVariant.SECONDARY}
                    />
                  }
                  title={translate('connectedAccounts')}
                >
                  <BrandDetailSocialMediaCard
                    brandId={brandId}
                    connectedPlatformsCount={connectedPlatformsCount}
                    connections={socialConnections}
                    isConnectAccountModalOpen={isConnectAccountModalOpen}
                    onConnectAccountModalOpenChange={
                      setIsConnectAccountModalOpen
                    }
                    onRefresh={() => handleRefreshBrand()}
                    variant="page"
                  />
                </CollectionSection>

                <BrandDetailExternalLinksCard
                  links={links}
                  onOpenLinkModal={handleOpenLinkModal}
                />
              </div>
            ) : (
              <BrandProfileArticles
                articles={articles}
                isError={isArticlesError}
                isPending={isArticlesPending}
              />
            )}
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
