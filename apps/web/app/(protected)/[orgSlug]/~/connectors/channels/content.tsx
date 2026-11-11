'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import Card from '@ui/card/Card';
import Loading from '@ui/loading/default/Loading';
import { buildSocialConnections } from '@ui/modals/brands/brand/ModalBrand.types';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import BrandDetailSocialMediaCard from '@/features/brands/components/sidebar/BrandDetailSocialMediaCard';
import { useBrandDetail } from '@/hooks/pages/use-brand-detail/use-brand-detail';
import { useConnectorsPrimaryAction } from '../connectors-primary-action';

/**
 * Connectors → Channels: the connected accounts of the organization's brand
 * (the selected one, else the first), with each account's status and
 * reconnect action. Each account's posting times, history import and health
 * live in its Settings dialog.
 */
export default function ConnectorsChannelsPage() {
  const translate = useTranslations('pages.brandSocialMedia');
  const [isConnectAccountModalOpen, setIsConnectAccountModalOpen] =
    useState(false);
  const { brands, isReady, selectedBrand } = useBrand();
  // On an organization route the brand context holds no selected brand (that
  // is a brand-route concept), so fall back to the organization's first brand.
  const channelsBrand = selectedBrand ?? brands[0];
  const {
    brand,
    brandId,
    handleRefreshBrand,
    hasBrandId,
    isLoading,
    connectedPlatformsCount,
  } = useBrandDetail({ fallbackBrandSlug: channelsBrand?.slug });
  // The accounts table also surfaces disconnected-but-not-deleted
  // credentials as "Needs reconnect", so it reads straight off the brand
  // instead of the connected-only list `useBrandDetail` exposes elsewhere.
  const connections = useMemo(() => buildSocialConnections(brand), [brand]);
  const openConnectAccountModal = useCallback(
    () => setIsConnectAccountModalOpen(true),
    [],
  );
  useConnectorsPrimaryAction(
    translate('connectAccount'),
    openConnectAccountModal,
  );

  if (isReady && !channelsBrand) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          {translate('brandNotFound')}
        </p>
      </Card>
    );
  }

  // Only the first read of the brand shows the spinner; a refetch keeps the
  // table on screen.
  if (!hasBrandId || (isLoading && !brand)) {
    return <Loading isFullSize={false} />;
  }

  if (!brand) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          {translate('brandNotFound')}
        </p>
      </Card>
    );
  }

  return (
    <BrandDetailSocialMediaCard
      brandId={brandId}
      connections={connections}
      connectedPlatformsCount={connectedPlatformsCount}
      isConnectAccountModalOpen={isConnectAccountModalOpen}
      onConnectAccountModalOpenChange={setIsConnectAccountModalOpen}
      onRefresh={() => handleRefreshBrand()}
      variant="page"
    />
  );
}
