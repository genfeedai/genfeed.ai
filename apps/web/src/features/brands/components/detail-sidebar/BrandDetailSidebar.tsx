'use client';

import { isPublicAssetScope } from '@genfeedai/helpers';
import type { BrandDetailSidebarProps } from '@props/pages/brand-detail.props';
import BrandDetailAccountSettingsCard from '@/features/brands/components/sidebar/BrandDetailAccountSettingsCard';
import BrandDetailExternalLinksCard from '@/features/brands/components/sidebar/BrandDetailExternalLinksCard';

/**
 * Public-profile column: visibility, website links, then the connected
 * social accounts.
 *
 * - Connected social accounts arrive as `children`: they own the Connect
 *   account modal and the reconnect flows.
 * - Website links are their own section: the inline list + ModalBrandLink. No
 *   dedicated settings page — external URLs are simple CRUD, not an OAuth
 *   surface.
 */
export default function BrandDetailSidebar({
  brand,
  links,
  isUpdatingPublicProfile = false,
  onTogglePublicProfile,
  onOpenLinkModal,
  children,
}: BrandDetailSidebarProps) {
  const isPublic = isPublicAssetScope(brand.scope);

  return (
    <div className="flex flex-col gap-6">
      <BrandDetailAccountSettingsCard
        isPublic={isPublic}
        isUpdating={isUpdatingPublicProfile}
        onToggle={onTogglePublicProfile}
      />

      <BrandDetailExternalLinksCard
        links={links}
        onOpenLinkModal={onOpenLinkModal}
      />

      {children}
    </div>
  );
}
