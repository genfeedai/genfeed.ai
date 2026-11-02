'use client';

import { isPublicAssetScope } from '@genfeedai/helpers';
import type { BrandDetailSidebarProps } from '@props/pages/brand-detail.props';
import BrandDetailAccountSettingsCard from '@/features/brands/components/sidebar/BrandDetailAccountSettingsCard';
import BrandDetailConnectedAccountsSection from '@/features/brands/components/sidebar/BrandDetailConnectedAccountsSection';
import BrandDetailExternalLinksCard from '@/features/brands/components/sidebar/BrandDetailExternalLinksCard';
import BrandDetailSocialMediaCard from '@/features/brands/components/sidebar/BrandDetailSocialMediaCard';

/**
 * Public-profile column: visibility + connected accounts + website links.
 *
 * - With `manageSocialHref`, a "Connected accounts" section lists the accounts
 *   as rows with a Manage link (OAuth lives on /settings/connected-accounts).
 * - Otherwise the full connect card owns the accounts.
 * - Website links are always their own section: the inline list +
 *   ModalBrandLink. No dedicated settings page — external URLs are simple
 *   CRUD, not an OAuth surface.
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
    <div className="flex flex-col gap-6 lg:sticky lg:top-4 lg:self-start">
      <BrandDetailAccountSettingsCard
        isPublic={isPublic}
        isUpdating={isUpdatingPublicProfile}
        onToggle={onTogglePublicProfile}
      />

      {manageSocialHref ? (
        <BrandDetailConnectedAccountsSection
          connections={socialConnections}
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
        onOpenLinkModal={onOpenLinkModal}
      />
    </div>
  );
}
