'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getBrandOrganizationSlug } from '@contexts/user/brand-context/brand-context.helpers';
import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import Loading from '@ui/loading/default/Loading';
import { buildSocialConnections } from '@ui/modals/brands/brand/ModalBrand.types';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import BrandDetailSocialMediaCard from '@/features/brands/components/sidebar/BrandDetailSocialMediaCard';
import { useBrandDetail } from '@/hooks/pages/use-brand-detail/use-brand-detail';
import { useConnectorsPrimaryAction } from '../connectors-primary-action';

/**
 * Connectors → Channels: the connected accounts of the brand selected in the
 * top bar, with each account's status and reconnect action. Each account's
 * posting times, history import and health live in its Settings dialog.
 *
 * Channels belongs to one brand, so it lives at
 * `/:org/:brand/connectors/channels`. The organization route
 * (`/:org/~/connectors/channels`, which every "connect an account" link
 * opens) carries no brand: it moves to the brand route of the selected brand,
 * or of the organization's first brand, keeping the query string.
 */
export default function ConnectorsChannelsPage() {
  const translate = useTranslations('pages.brandSocialMedia');
  const [isConnectAccountModalOpen, setIsConnectAccountModalOpen] =
    useState(false);
  const { brands, isReady, selectedBrand } = useBrand();
  const { brandSlug: routeBrandSlug, orgSlug } = useOrgUrl();
  const router = useRouter();
  const search = useSearchParams()?.toString() ?? '';
  const channelsBrand =
    selectedBrand ??
    brands.find((candidate) => getBrandOrganizationSlug(candidate) === orgSlug);
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
  const brandRouteHref =
    !routeBrandSlug && channelsBrand?.slug
      ? `${createBrandAppRoute(orgSlug, channelsBrand.slug, APP_ROUTES.CONNECTORS.CHANNELS)}${search ? `?${search}` : ''}`
      : '';
  useEffect(() => {
    if (brandRouteHref) {
      router.replace(brandRouteHref);
    }
  }, [brandRouteHref, router]);
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

  if (brandRouteHref) {
    return <Loading isFullSize={false} />;
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
