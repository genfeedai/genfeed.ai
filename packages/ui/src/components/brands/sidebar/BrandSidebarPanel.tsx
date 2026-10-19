'use client';

import { AssetCategory, AssetScope } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { isPublicAssetScope } from '@genfeedai/helpers';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import type { BrandSidebarPanelProps } from '@genfeedai/props/ui/brands/brand-sidebar.props';
import BrandOverviewPanel from '@ui/brands/sidebar/BrandOverviewPanel';
import { useBrandSidebarPanel } from '@ui/brands/sidebar/useBrandSidebarPanel';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import {
  LazyModalBrandGenerate,
  LazyModalBrandLink,
} from '@ui/lazy/modal/LazyModal';
import { useTranslations } from 'next-intl';

/**
 * A brand's overview in the right context sidebar: identity, kit assets,
 * links and connected accounts, edited in place. Name and description are the
 * only fields edited here; everything else lives on the brand settings page.
 */
export default function BrandSidebarPanel(props: BrandSidebarPanelProps) {
  const translate = useTranslations('ui.brandSidebar');
  const { orgSlug } = useOrgUrl();
  const {
    activeBrand,
    connectedPlatformsCount,
    error,
    generateCost,
    generateModalType,
    handleCopy,
    handleGenerateBanner,
    handleGenerateConfirm,
    handleGenerateLogo,
    handleLinkConfirm,
    handleOpenLinkModal,
    handleOpenUploadModal,
    handleRefresh,
    handleRequestDeleteReference,
    handleUpdateBrandField,
    isLoadingBrand,
    selectedLink,
    socialConnections,
  } = useBrandSidebarPanel(props);

  if (!activeBrand) {
    return (
      <p role="status" className="p-4 text-sm text-foreground/60">
        {isLoadingBrand ? translate('loading') : translate('unavailable')}
      </p>
    );
  }

  const settingsHref =
    orgSlug && activeBrand.slug
      ? createBrandAppRoute(orgSlug, activeBrand.slug, APP_ROUTES.SETTINGS.ROOT)
      : undefined;

  return (
    <>
      <TableRowSummary
        badges={
          <>
            <span className="rounded-full border border-border bg-tertiary px-3 py-1 text-xs text-muted-foreground">
              {isPublicAssetScope(activeBrand.scope)
                ? translate('public')
                : translate('private')}
            </span>
            <span className="rounded-full border border-border bg-tertiary px-3 py-1 text-xs text-muted-foreground">
              {translate('connected', { count: connectedPlatformsCount })}
            </span>
          </>
        }
        openHref={settingsHref}
        openLabel={translate('openSettings')}
      >
        <BrandOverviewPanel
          activeBrand={activeBrand}
          connectedPlatformsCount={connectedPlatformsCount}
          error={error}
          socialConnections={socialConnections}
          onCopy={handleCopy}
          onDeleteReference={handleRequestDeleteReference}
          onGenerateBanner={handleGenerateBanner}
          onGenerateLogo={handleGenerateLogo}
          onOpenLinkModal={handleOpenLinkModal}
          onRefreshBrand={handleRefresh}
          onTogglePublicProfile={(isPublic) =>
            void handleUpdateBrandField(
              'scope',
              isPublic ? AssetScope.PUBLIC : AssetScope.BRAND,
            )
          }
          onUpdateBrand={handleUpdateBrandField}
          onUploadBanner={() => handleOpenUploadModal(AssetCategory.BANNER)}
          onUploadLogo={() => handleOpenUploadModal(AssetCategory.LOGO)}
          onUploadReference={() =>
            handleOpenUploadModal(AssetCategory.REFERENCE)
          }
        />
      </TableRowSummary>

      {generateModalType ? (
        <LazyModalBrandGenerate
          type={generateModalType}
          cost={generateCost}
          brandId={activeBrand.id}
          onConfirm={() => {
            void handleGenerateConfirm();
          }}
        />
      ) : null}

      <LazyModalBrandLink
        brandId={activeBrand.id}
        link={selectedLink}
        onConfirm={handleLinkConfirm}
      />
    </>
  );
}
