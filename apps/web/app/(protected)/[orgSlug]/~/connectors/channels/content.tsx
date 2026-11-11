'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getBrandOrganizationSlug } from '@contexts/user/brand-context/brand-context.helpers';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import Loading from '@ui/loading/default/Loading';
import { buildSocialConnections } from '@ui/modals/brands/brand/ModalBrand.types';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import BrandDetailSocialMediaCard from '@/features/brands/components/sidebar/BrandDetailSocialMediaCard';
import { useBrandDetail } from '@/hooks/pages/use-brand-detail/use-brand-detail';
import { useConnectorsPrimaryAction } from '../connectors-primary-action';

/**
 * Connectors → Channels: the connected accounts of the brand selected in the
 * top bar, with each account's status and reconnect action. Each account's
 * posting times, history import and health live in its Settings dialog.
 *
 * Connectors is an organization page, and an organization route carries no
 * brand, so the brand context has none selected there. `?brand=<slug>` names
 * the brand to show (brand Settings links here with it). Without it the page
 * shows the selected brand, then the first brand of the organization, instead
 * of a dead end.
 */
export default function ConnectorsChannelsPage() {
  const translate = useTranslations('pages.brandSocialMedia');
  const [isConnectAccountModalOpen, setIsConnectAccountModalOpen] =
    useState(false);
  const { brands, isReady, selectedBrand } = useBrand();
  const { orgSlug } = useOrgUrl();
  const requestedBrandSlug = useSearchParams()?.get('brand') ?? '';
  const organizationBrands = brands.filter(
    (candidate) => getBrandOrganizationSlug(candidate) === orgSlug,
  );
  const channelsBrand =
    organizationBrands.find(
      (candidate) =>
        requestedBrandSlug.length > 0 && candidate.slug === requestedBrandSlug,
    ) ??
    selectedBrand ??
    organizationBrands[0];
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
