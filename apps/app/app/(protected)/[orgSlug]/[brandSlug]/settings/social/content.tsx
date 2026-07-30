'use client';

import { ModalEnum } from '@genfeedai/enums';
import { openModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import type { ILink } from '@genfeedai/interfaces';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import BrandDetailExternalLinksCard from '@pages/brands/components/sidebar/BrandDetailExternalLinksCard';
import BrandDetailSocialMediaCard from '@pages/brands/components/sidebar/BrandDetailSocialMediaCard';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { LazyModalBrandLink } from '@ui/lazy/modal/LazyModal';
import Loading from '@ui/loading/default/Loading';
import { useCallback } from 'react';

/**
 * Full-width Social & Links settings — connected accounts + external links.
 * Profile keeps a summary only. Add/edit link opens ModalBrandLink.
 */
export default function BrandSettingsSocialPage() {
  const {
    brand,
    brandId,
    hasBrandId,
    isLoading,
    links,
    selectedLink,
    socialConnections,
    connectedPlatformsCount,
    handleRefreshBrand,
    selectLink,
  } = useBrandDetail();

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

        <BrandDetailExternalLinksCard
          links={links}
          onOpenLinkModal={handleOpenLinkModal}
        />
      </div>

      <LazyModalBrandLink
        brandId={brandId}
        link={selectedLink}
        onConfirm={handleLinkConfirm}
      />
    </Container>
  );
}
