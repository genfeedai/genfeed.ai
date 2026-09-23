'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import BrandDetailSocialMediaCard from '@pages/brands/components/sidebar/BrandDetailSocialMediaCard';
import BrandSocialHistoryImportCard from '@pages/brands/components/sidebar/BrandSocialHistoryImportCard';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { buildSocialConnections } from '@ui/modals/brands/brand/ModalBrand.types';
import { Button } from '@ui/primitives/button';
import { Plug, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

/**
 * Brand Integrations settings — connected accounts and their history imports.
 * External website links live on Brand Profile via ModalBrandLink.
 */
export default function BrandSettingsIntegrationsPage() {
  const translate = useTranslations('pages.brandSocialMedia');
  const translateIntegrations = useTranslations('pages.brandIntegrations');
  const [activeTab, setActiveTab] = useState('connections');
  const [isConnectAccountModalOpen, setIsConnectAccountModalOpen] =
    useState(false);
  const {
    brand,
    brandId,
    handleRefreshBrand,
    hasBrandId,
    isLoading,
    connectedPlatformsCount,
  } = useBrandDetail();
  // The accounts table also surfaces disconnected-but-not-deleted
  // credentials as "Needs reconnect", so it reads straight off the brand
  // instead of the connected-only list `useBrandDetail` exposes elsewhere.
  const connections = useMemo(() => buildSocialConnections(brand), [brand]);

  if (!hasBrandId || isLoading) {
    return <Loading isFullSize={false} />;
  }

  if (!brand) {
    return (
      <Container>
        <Card>
          <p className="text-sm text-muted-foreground">
            {translate('brandNotFound')}
          </p>
        </Card>
      </Container>
    );
  }

  return (
    <Container
      description={translateIntegrations('description')}
      icon={Plug}
      label={translateIntegrations('title')}
      right={
        activeTab === 'connections' ? (
          <Button
            icon={<Plus className="size-4" />}
            label={translate('connectAccount')}
            onClick={() => setIsConnectAccountModalOpen(true)}
            variant={ButtonVariant.DEFAULT}
          />
        ) : undefined
      }
      headerTabs={{
        activeTab,
        ariaLabel: translateIntegrations('title'),
        fullWidth: false,
        onTabChange: setActiveTab,
        tabs: [
          { id: 'connections', label: translateIntegrations('connections') },
          { id: 'imports', label: translateIntegrations('imports') },
        ],
      }}
    >
      {activeTab === 'imports' ? (
        <BrandSocialHistoryImportCard
          brand={brand}
          brandId={brandId}
          onRefreshBrand={() => handleRefreshBrand(true)}
        />
      ) : (
        <BrandDetailSocialMediaCard
          brandId={brandId}
          connections={connections}
          connectedPlatformsCount={connectedPlatformsCount}
          isConnectAccountModalOpen={isConnectAccountModalOpen}
          onConnectAccountModalOpenChange={setIsConnectAccountModalOpen}
          onRefresh={() => handleRefreshBrand(true)}
          variant="page"
        />
      )}
    </Container>
  );
}
