'use client';

import { AssetScope } from '@genfeedai/enums';

import BrandDetailAccountSettingsCard from '@pages/brands/components/sidebar/BrandDetailAccountSettingsCard';
import BrandDetailAgentProfileCard from '@pages/brands/components/sidebar/BrandDetailAgentProfileCard';
import BrandDetailDefaultModelsCard from '@pages/brands/components/sidebar/BrandDetailDefaultModelsCard';
import BrandDetailExternalLinksCard from '@pages/brands/components/sidebar/BrandDetailExternalLinksCard';
import BrandDetailIdentityCard from '@pages/brands/components/sidebar/BrandDetailIdentityCard';
import BrandDetailReferencesCard from '@pages/brands/components/sidebar/BrandDetailReferencesCard';
import BrandDetailSocialMediaCard from '@pages/brands/components/sidebar/BrandDetailSocialMediaCard';
import type { BrandDetailSidebarProps } from '@props/pages/brand-detail.props';
import BrandCompletenessCard from '@ui/cards/brand-completeness-card/BrandCompletenessCard';

export default function BrandDetailSidebar({
  brand,
  brandId,
  links,
  socialConnections,
  connectedPlatformsCount,
  deletingRefId,
  onTogglePublicProfile,
  onRefreshBrand,
  onOpenLinkModal,
  onUploadReference,
  onDeleteReference,
}: BrandDetailSidebarProps) {
  return (
    <div className="flex flex-col gap-6 lg:sticky lg:top-4 lg:self-start">
      <BrandCompletenessCard brand={brand} />

      <BrandDetailAccountSettingsCard
        isPublic={brand.scope === AssetScope.PUBLIC}
        onToggle={onTogglePublicProfile}
      />

      <BrandDetailSocialMediaCard
        brandId={brand.id}
        connections={socialConnections}
        connectedPlatformsCount={connectedPlatformsCount}
      />

      <BrandDetailExternalLinksCard
        links={links}
        onOpenLinkModal={onOpenLinkModal}
      />

      <BrandDetailDefaultModelsCard brand={brand} />

      <BrandDetailAgentProfileCard
        brand={brand}
        brandId={brandId}
        onRefreshBrand={onRefreshBrand}
      />

      <BrandDetailIdentityCard
        brand={brand}
        brandId={brandId}
        onRefreshBrand={onRefreshBrand}
      />

      <BrandDetailReferencesCard
        brand={brand}
        deletingRefId={deletingRefId}
        onUploadReference={onUploadReference}
        onDeleteReference={onDeleteReference}
      />
    </div>
  );
}
