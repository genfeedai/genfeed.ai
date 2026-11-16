'use client';

import { isPublicAssetScope } from '@genfeedai/helpers';
import type { BrandDetailSidebarProps } from '@props/pages/brand-detail.props';
import BrandDetailAccountSettingsCard from '@/features/brands/components/sidebar/BrandDetailAccountSettingsCard';
import BrandDetailExternalLinksCard from '@/features/brands/components/sidebar/BrandDetailExternalLinksCard';

/**
 * Public-profile column: visibility + website links.
 *
 * - Connected social accounts are not here: they sit beside the brand's
 *   details, where the Connect account modal opens.
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
}: BrandDetailSidebarProps) {
  const isPublic = isPublicAssetScope(brand.scope);

  return (
    <div className="flex flex-col gap-6 lg:sticky lg:top-4 lg:self-start">
      <BrandDetailAccountSettingsCard
        isPublic={isPublic}
        isUpdating={isUpdatingPublicProfile}
        onToggle={onTogglePublicProfile}
      />

      <BrandDetailExternalLinksCard
        links={links}
        onOpenLinkModal={onOpenLinkModal}
      />
    </div>
  );
}
