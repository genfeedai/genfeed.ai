'use client';

import { isPublicAssetScope } from '@genfeedai/helpers';

import BrandDetailAccountSettingsCard from '@pages/brands/components/sidebar/BrandDetailAccountSettingsCard';
import BrandDetailExternalLinksCard from '@pages/brands/components/sidebar/BrandDetailExternalLinksCard';
import BrandDetailSocialMediaCard from '@pages/brands/components/sidebar/BrandDetailSocialMediaCard';
import BrandDetailSocialSummaryCard from '@pages/brands/components/sidebar/BrandDetailSocialSummaryCard';
import type { BrandDetailSidebarProps } from '@props/pages/brand-detail.props';

/**
 * Public-profile column: visibility + social accounts + external links.
 *
 * - Social: `manageSocialHref` → summary linking to /settings/social (OAuth page).
 *   Otherwise full connect card + modal.
 * - Links: always the inline list + ModalBrandLink. No dedicated settings page —
 *   external URLs are simple CRUD, not an OAuth surface.
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
  onRefreshBrand,
}: BrandDetailSidebarProps) {
  const isPublic = isPublicAssetScope(brand.scope);

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
          manageHref={manageSocialHref}
        />
      ) : (
        <BrandDetailSocialMediaCard
          brandId={brand.id}
          connections={socialConnections}
          connectedPlatformsCount={connectedPlatformsCount}
          onRefresh={onRefreshBrand}
        />
      )}

      <BrandDetailExternalLinksCard
        links={links}
        socialConnections={socialConnections}
        manageSocialHref={manageSocialHref}
        onOpenLinkModal={onOpenLinkModal}
      />
    </div>
  );
}
