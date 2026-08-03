'use client';

import { isPublicAssetScope } from '@genfeedai/helpers';

import BrandDetailAccountSettingsCard from '@pages/brands/components/sidebar/BrandDetailAccountSettingsCard';
import BrandDetailExternalLinksCard from '@pages/brands/components/sidebar/BrandDetailExternalLinksCard';
import BrandDetailLinksSummaryCard from '@pages/brands/components/sidebar/BrandDetailLinksSummaryCard';
import BrandDetailSocialMediaCard from '@pages/brands/components/sidebar/BrandDetailSocialMediaCard';
import BrandDetailSocialSummaryCard from '@pages/brands/components/sidebar/BrandDetailSocialSummaryCard';
import type { BrandDetailSidebarProps } from '@props/pages/brand-detail.props';

/**
 * Public-profile column: visibility + social accounts + external links.
 * Settings Profile passes manage hrefs → summary cards.
 * Modal/overlay leaves them unset → full Social + Links editors.
 */
export default function BrandDetailSidebar({
  brand,
  links,
  socialConnections,
  connectedPlatformsCount,
  isUpdatingPublicProfile = false,
  manageSocialHref,
  manageLinksHref,
  onTogglePublicProfile,
  onOpenLinkModal,
}: BrandDetailSidebarProps) {
  const isPublic = isPublicAssetScope(brand.scope);
  const showSummaries = Boolean(manageSocialHref || manageLinksHref);

  return (
    <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
      <BrandDetailAccountSettingsCard
        isPublic={isPublic}
        isUpdating={isUpdatingPublicProfile}
        onToggle={onTogglePublicProfile}
      />

      {showSummaries ? (
        <>
          {manageSocialHref ? (
            <BrandDetailSocialSummaryCard
              connectedPlatformsCount={connectedPlatformsCount}
              manageHref={manageSocialHref}
            />
          ) : null}
          {manageLinksHref ? (
            <BrandDetailLinksSummaryCard
              linksCount={links?.length ?? 0}
              manageHref={manageLinksHref}
            />
          ) : null}
        </>
      ) : (
        <>
          <BrandDetailSocialMediaCard
            brandId={brand.id}
            connections={socialConnections}
            connectedPlatformsCount={connectedPlatformsCount}
          />

          <BrandDetailExternalLinksCard
            links={links}
            onOpenLinkModal={onOpenLinkModal}
          />
        </>
      )}
    </div>
  );
}
