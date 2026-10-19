'use client';

import { isPublicAssetScope } from '@genfeedai/helpers';

import {
  getAccountConnectionStatus,
  isSocialProfilePlatform,
} from '@pages/brands/components/integrations/account-connection-status.util';
import BrandDetailAccountSettingsCard from '@pages/brands/components/sidebar/BrandDetailAccountSettingsCard';
import BrandDetailExternalLinksCard from '@pages/brands/components/sidebar/BrandDetailExternalLinksCard';
import BrandDetailSocialMediaCard from '@pages/brands/components/sidebar/BrandDetailSocialMediaCard';
import type { BrandDetailSidebarProps } from '@props/pages/brand-detail.props';
import { useMemo } from 'react';

/**
 * Public-profile column: visibility + social accounts + website links.
 *
 * - With `manageSocialHref`, one "Social & links" card: connected count + Manage
 *   (OAuth lives on /settings/connected-accounts) above the website links.
 * - Otherwise the full connect card, with a separate website-links card.
 * - Links are always the inline list + ModalBrandLink. No dedicated settings page —
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
  const social = useMemo(() => {
    if (!manageSocialHref) {
      return undefined;
    }

    const connected = socialConnections.filter(
      (connection) => getAccountConnectionStatus(connection) === 'connected',
    );
    const connectedSocialCount = connected.filter((connection) =>
      isSocialProfilePlatform(connection.platform),
    ).length;

    return {
      connectedAdAccountCount: connected.length - connectedSocialCount,
      connectedSocialCount,
      manageHref: manageSocialHref,
    };
  }, [manageSocialHref, socialConnections]);

  return (
    <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
      <BrandDetailAccountSettingsCard
        isPublic={isPublic}
        isUpdating={isUpdatingPublicProfile}
        onToggle={onTogglePublicProfile}
      />

      {manageSocialHref ? null : (
        <BrandDetailSocialMediaCard
          brandId={brand.id}
          connections={socialConnections}
          connectedPlatformsCount={connectedPlatformsCount}
          onRefresh={onRefreshBrand}
        />
      )}

      <BrandDetailExternalLinksCard
        links={links}
        social={social}
        onOpenLinkModal={onOpenLinkModal}
      />
    </div>
  );
}
