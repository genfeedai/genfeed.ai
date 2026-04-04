'use client';

import type { ILink } from '@genfeedai/interfaces';
import {
  AlertCategory,
  AssetCategory,
  AssetScope,
  LinkCategory,
  ModelKey,
} from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useElements } from '@hooks/data/elements/use-elements/use-elements';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import { Link } from '@models/social/link.model';
import BrandDetailBanner from '@pages/brands/components/banner/BrandDetailBanner';
import BrandDetailSidebar from '@pages/brands/components/detail-sidebar/BrandDetailSidebar';
import BrandDetailLatestArticles from '@pages/brands/components/latest-articles/BrandDetailLatestArticles';
import BrandDetailLatestImages from '@pages/brands/components/latest-images/BrandDetailLatestImages';
import BrandDetailLatestVideos from '@pages/brands/components/latest-videos/BrandDetailLatestVideos';
import BrandDetailOverview from '@pages/brands/components/overview/BrandDetailOverview';
import BrandDetailLinkEditor, {
  type BrandLinkEditorValues,
} from '@pages/brands/components/sidebar/BrandDetailLinkEditor';
import BrandDetailSystemPrompt from '@pages/brands/components/system-prompt/BrandDetailSystemPrompt';
import { useBrandOverlay } from '@providers/global-modals/global-modals.provider';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { LinksService } from '@services/social/links.service';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import { LazyModalBrandGenerate } from '@ui/lazy/modal/LazyModal';
import Loading from '@ui/loading/default/Loading';
import { type ChangeEvent, useCallback, useMemo, useState } from 'react';

const DEFAULT_BRAND_LINK_FORM_VALUES: BrandLinkEditorValues = {
  category: LinkCategory.WEBSITE,
  label: '',
  url: '',
};

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
    deletingRefId,
    socialConnections,
    connectedPlatformsCount,
    handleGenerateBanner,
    handleGenerateLogo,
    handleUpdateAccount,
    handleOpenUploadModal,
    handleRequestDeleteReference,
    handleCopy,
    handleRefreshBrand,
    selectLink,
    generateModalType,
    setGenerateModalType,
  } = useBrandDetail();

  const { openBrandOverlay } = useBrandOverlay();
  const getLinksService = useAuthedService((token: string) =>
    LinksService.getInstance(token),
  );
  const { imageModels } = useElements();
  const [isLinkEditorOpen, setIsLinkEditorOpen] = useState(false);
  const [linkFormValues, setLinkFormValues] = useState<BrandLinkEditorValues>(
    DEFAULT_BRAND_LINK_FORM_VALUES,
  );
  const [linkEditorError, setLinkEditorError] = useState<string | null>(null);
  const [isSubmittingLink, setIsSubmittingLink] = useState(false);

  const generateCost = useMemo(() => {
    if (!brand || !generateModalType) {
      return 5;
    }
    const modelToUse =
      brand.defaultImageModel || ModelKey.REPLICATE_GOOGLE_IMAGEN_4_FAST;
    const model = imageModels.find((m) => m.key === modelToUse);
    return model?.cost || 5;
  }, [brand, generateModalType, imageModels]);

  const handleOpenBrandModal = () => {
    openBrandOverlay(brand, () => handleRefreshBrand(true), 'edit');
  };

  const handleGenerateConfirm = () => {
    setGenerateModalType(null);
    void handleRefreshBrand(true);
  };

  const handleOpenLinkModal = (link?: ILink) => {
    selectLink(link ?? null);
    setLinkFormValues({
      category: link?.category ?? LinkCategory.WEBSITE,
      label: link?.label ?? '',
      url: link?.url ?? '',
    });
    setLinkEditorError(null);
    setIsLinkEditorOpen(true);
  };

  const closeLinkEditor = useCallback(() => {
    selectLink(null);
    setLinkFormValues(DEFAULT_BRAND_LINK_FORM_VALUES);
    setLinkEditorError(null);
    setIsLinkEditorOpen(false);
  }, [selectLink]);

  const handleLinkFieldChange = useCallback(
    (
      event: ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      const { name, value } = event.target;
      setLinkFormValues((current) => ({
        ...current,
        [name]: value,
      }));
    },
    [],
  );

  const handleLinkSubmit = useCallback(async () => {
    if (!brandId) {
      return;
    }

    if (!linkFormValues.label.trim() || !linkFormValues.url.trim()) {
      setLinkEditorError('Label and URL are required.');
      return;
    }

    try {
      new URL(linkFormValues.url);
    } catch {
      setLinkEditorError('Enter a valid URL, including http:// or https://.');
      return;
    }

    setIsSubmittingLink(true);
    setLinkEditorError(null);

    try {
      const service = await getLinksService();
      const payload = {
        brand: brandId,
        category: linkFormValues.category,
        label: linkFormValues.label.trim(),
        url: linkFormValues.url.trim(),
      } as unknown as Partial<Link>;

      if (selectedLink?.id) {
        await service.patch(selectedLink.id, payload);
      } else {
        await service.post(payload);
      }

      await handleRefreshBrand(true);
      closeLinkEditor();
    } catch (linkError) {
      logger.error('Failed to save brand link', linkError);
      setLinkEditorError('Failed to save link');
    } finally {
      setIsSubmittingLink(false);
    }
  }, [
    brandId,
    closeLinkEditor,
    getLinksService,
    handleRefreshBrand,
    linkFormValues,
    selectedLink?.id,
  ]);

  const handleLinkDelete = useCallback(async () => {
    if (!selectedLink?.id) {
      return;
    }

    setIsSubmittingLink(true);
    setLinkEditorError(null);

    try {
      const service = await getLinksService();
      await service.delete(selectedLink.id);
      await handleRefreshBrand(true);
      closeLinkEditor();
    } catch (linkError) {
      logger.error('Failed to delete brand link', linkError);
      setLinkEditorError('Failed to delete link');
    } finally {
      setIsSubmittingLink(false);
    }
  }, [closeLinkEditor, getLinksService, handleRefreshBrand, selectedLink?.id]);

  const handleCopyPublicProfile = () => {
    if (!brand?.slug) {
      return;
    }

    handleCopy(`${EnvironmentService.apps.website}/u/${brand.slug}`);
  };

  if (!hasBrandId) {
    return (
      <Container>
        <Alert type={AlertCategory.ERROR}>Error! Invalid brand ID.</Alert>
      </Container>
    );
  }

  if (isLoading) {
    return <Loading isFullSize={false} />;
  }

  if (!brand) {
    return (
      <Container>
        <Alert type={AlertCategory.ERROR}>Error! Account not found.</Alert>
      </Container>
    );
  }

  return (
    <Container>
      <BrandDetailBanner
        brand={brand}
        isGeneratingBanner={isGeneratingBanner}
        onUploadBanner={() => handleOpenUploadModal(AssetCategory.BANNER)}
        onGenerateBanner={handleGenerateBanner}
      />

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-8 flex flex-col gap-6">
          <BrandDetailOverview
            brand={brand}
            isGeneratingLogo={isGeneratingLogo}
            onUploadLogo={() => handleOpenUploadModal(AssetCategory.LOGO)}
            onGenerateLogo={handleGenerateLogo}
            onEditBrand={handleOpenBrandModal}
            onCopyPublicProfile={
              brand.scope === AssetScope.PUBLIC
                ? handleCopyPublicProfile
                : undefined
            }
          />

          {brand.text && (
            <BrandDetailSystemPrompt text={brand.text} onCopy={handleCopy} />
          )}

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
            deletingRefId={deletingRefId}
            onTogglePublicProfile={(isPublic) =>
              handleUpdateAccount(
                'scope',
                isPublic ? AssetScope.PUBLIC : AssetScope.BRAND,
              )
            }
            onRefreshBrand={() => handleRefreshBrand(true)}
            onOpenLinkModal={handleOpenLinkModal}
            onUploadReference={() =>
              handleOpenUploadModal(AssetCategory.REFERENCE)
            }
            onDeleteReference={handleRequestDeleteReference}
          />

          {isLinkEditorOpen ? (
            <div className="mt-6">
              <BrandDetailLinkEditor
                error={linkEditorError}
                isSubmitting={isSubmittingLink}
                isEditing={Boolean(selectedLink)}
                values={linkFormValues}
                onChange={handleLinkFieldChange}
                onCancel={closeLinkEditor}
                onDelete={handleLinkDelete}
                onSubmit={handleLinkSubmit}
              />
            </div>
          ) : null}
        </div>
      </div>

      <LazyModalBrandGenerate
        type={generateModalType || 'banner'}
        cost={generateCost}
        brandId={brandId}
        onConfirm={handleGenerateConfirm}
      />
    </Container>
  );
}
