'use client';

import { creatorProfilePath } from '@genfeedai/contracts/constants';
import type { ILink } from '@genfeedai/contracts/interfaces';
import { isPublicAssetScope } from '@genfeedai/helpers';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import Card from '@ui/card/Card';
import type { BrandOverlayRecord } from '@ui/modals/brands/brand/ModalBrand.types';
import { Alert } from '@ui/primitives/alert';
import BrandDetailBanner from '@/features/brands/components/banner/BrandDetailBanner';
import BrandDetailOverview from '@/features/brands/components/overview/BrandDetailOverview';
import BrandDetailExternalLinksCard from '@/features/brands/components/sidebar/BrandDetailExternalLinksCard';
import BrandDetailSocialMediaCard from '@/features/brands/components/sidebar/BrandDetailSocialMediaCard';
import BrandDetailSystemPrompt from '@/features/brands/components/system-prompt/BrandDetailSystemPrompt';
import BrandProfileVisibility from '@/features/brands/components/visibility/BrandProfileVisibility';

export type BrandOverviewPanelProps = {
  activeBrand: BrandOverlayRecord;
  connectedPlatformsCount: number;
  error: string | null;
  profileHref?: string;
  socialConnections: BrandDetailSocialConnection[];
  onCopy: (text?: string) => Promise<void>;
  onGenerateBanner: () => void;
  onGenerateLogo: () => void;
  onOpenLinkModal: (link?: ILink) => void;
  onRefreshBrand: () => Promise<void>;
  onTogglePublicProfile: (isPublic: boolean) => void;
  onUpdateBrand: (
    field: 'label' | 'description',
    value: string,
  ) => Promise<void>;
  onUploadBanner: () => void;
  onUploadLogo: () => void;
};

export default function BrandOverviewPanel({
  activeBrand,
  connectedPlatformsCount,
  error,
  profileHref,
  socialConnections,
  onCopy,
  onGenerateBanner,
  onGenerateLogo,
  onOpenLinkModal,
  onRefreshBrand,
  onTogglePublicProfile,
  onUpdateBrand,
  onUploadBanner,
  onUploadLogo,
}: BrandOverviewPanelProps) {
  const profileUrl = `${EnvironmentService.apps.website}${creatorProfilePath(activeBrand.slug)}`;

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <div>{error}</div>
        </Alert>
      ) : null}

      <BrandDetailBanner
        brand={activeBrand}
        isGeneratingBanner={false}
        onUploadBanner={onUploadBanner}
        onGenerateBanner={onGenerateBanner}
      />

      <Card>
        <BrandDetailOverview
          brand={activeBrand}
          isGeneratingLogo={false}
          onUploadLogo={onUploadLogo}
          onGenerateLogo={onGenerateLogo}
          onUpdateBrand={onUpdateBrand}
          visibility={
            <BrandProfileVisibility
              isPublic={isPublicAssetScope(activeBrand.scope)}
              onCopy={() => onCopy(profileUrl)}
              onToggle={onTogglePublicProfile}
              profileUrl={profileUrl}
            />
          }
        />
      </Card>

      {activeBrand.text ? (
        <Card>
          <BrandDetailSystemPrompt text={activeBrand.text} onCopy={onCopy} />
        </Card>
      ) : null}

      <BrandDetailSocialMediaCard
        brandId={activeBrand.id}
        connectedPlatformsCount={connectedPlatformsCount}
        connections={socialConnections}
        historyImportReturnTo={profileHref}
        onRefresh={onRefreshBrand}
      />

      <BrandDetailExternalLinksCard
        links={(activeBrand.links || []) as unknown as ILink[]}
        onOpenLinkModal={onOpenLinkModal}
      />
    </div>
  );
}
