'use client';

import { AssetScope } from '@genfeedai/enums';

import BrandDetailAccountSettingsCard from '@pages/brands/components/sidebar/BrandDetailAccountSettingsCard';
import BrandDetailExternalLinksCard from '@pages/brands/components/sidebar/BrandDetailExternalLinksCard';
import BrandDetailSocialMediaCard from '@pages/brands/components/sidebar/BrandDetailSocialMediaCard';
import BrandDetailSocialSummaryCard from '@pages/brands/components/sidebar/BrandDetailSocialSummaryCard';
import type { BrandDetailSidebarProps } from '@props/pages/brand-detail.props';

/**
 * Public-profile column: visibility + social/links.
 * Settings Profile passes `manageSocialHref` → summary only.
 * Modal/overlay leaves it unset → full Social + Links editors.
 */
export default function BrandDetailSidebar({
  brand,
  links,
  socialConnections,
  connectedPlatformsCount,
  isUpdatingPublicProfile = false,
  manageSocialHref,
  onTogglePublicProfile,
  onOpenLinkModal,
}: BrandDetailSidebarProps) {
  const isPublic =
    typeof brand.scope === 'string' &&
    brand.scope.toLowerCase() === AssetScope.PUBLIC;

  return (
    <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
      <BrandDetailAccountSettingsCard
        isPublic={isPublic}
        isUpdating={isUpdatingPublicProfile}
        onToggle={onTogglePublicProfile}
      />

      {manageSocialHref ? (
        <BrandDetailSocialSummaryCard
          connectedPlatformsCount={connectedPlatformsCount}
          linksCount={links?.length ?? 0}
          manageHref={manageSocialHref}
        />
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
