'use client';

import { AlertCategory, AssetScope } from '@genfeedai/enums';
import type { ILink } from '@genfeedai/interfaces';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import BrandDetailBanner from '@pages/brands/components/banner/BrandDetailBanner';
import BrandDetailSidebar from '@pages/brands/components/detail-sidebar/BrandDetailSidebar';
import BrandDetailOverview from '@pages/brands/components/overview/BrandDetailOverview';
import BrandDetailLinkEditor, {
  type BrandLinkEditorValues,
} from '@pages/brands/components/sidebar/BrandDetailLinkEditor';
import BrandDetailSystemPrompt from '@pages/brands/components/system-prompt/BrandDetailSystemPrompt';
import Card from '@ui/card/Card';
import Alert from '@ui/feedback/alert/Alert';
import type { ChangeEvent } from 'react';
import type { BrandOverlayRecord } from './ModalBrand.types';

export type BrandOverviewPanelProps = {
  activeBrand: BrandOverlayRecord;
  connectedPlatformsCount: number;
  error: string | null;
  isLinkEditorOpen: boolean;
  isSubmittingLink: boolean;
  linkEditorError: string | null;
  linkFormValues: BrandLinkEditorValues;
  selectedLink: { id?: string } | null;
  socialConnections: BrandDetailSocialConnection[];
  onCopy: (text?: string) => Promise<void>;
  onDeleteReference: (assetId: string) => void;
  onEditBrand: () => void;
  onGenerateBanner: () => void;
  onGenerateLogo: () => void;
  onLinkCancel: () => void;
  onLinkDelete: () => Promise<void>;
  onLinkFieldChange: (
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => void;
  onLinkSubmit: () => Promise<void>;
  onOpenLinkModal: (link?: ILink) => void;
  onRefreshBrand: () => Promise<void>;
  onTogglePublicProfile: (isPublic: boolean) => void;
  onUploadBanner: () => void;
  onUploadLogo: () => void;
  onUploadReference: () => void;
};

export default function BrandOverviewPanel({
  activeBrand,
  connectedPlatformsCount,
  error,
  isLinkEditorOpen,
  isSubmittingLink,
  linkEditorError,
  linkFormValues,
  selectedLink,
  socialConnections,
  onCopy,
  onDeleteReference,
  onEditBrand,
  onGenerateBanner,
  onGenerateLogo,
  onLinkCancel,
  onLinkDelete,
  onLinkFieldChange,
  onLinkSubmit,
  onOpenLinkModal,
  onRefreshBrand,
  onTogglePublicProfile,
  onUploadBanner,
  onUploadLogo,
  onUploadReference,
}: BrandOverviewPanelProps) {
  return (
    <div className="space-y-6">
      {error ? (
        <Alert type={AlertCategory.ERROR}>
          <div>{error}</div>
        </Alert>
      ) : null}

      <BrandDetailBanner
        brand={activeBrand}
        isGeneratingBanner={false}
        onUploadBanner={onUploadBanner}
        onGenerateBanner={onGenerateBanner}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <Card className="bg-card/80 backdrop-blur-sm" bodyClassName="p-6">
            <BrandDetailOverview
              brand={activeBrand}
              isGeneratingLogo={false}
              onUploadLogo={onUploadLogo}
              onGenerateLogo={onGenerateLogo}
              onEditBrand={onEditBrand}
              onCopyPublicProfile={
                activeBrand.scope === AssetScope.PUBLIC
                  ? () =>
                      onCopy(
                        `${EnvironmentService.apps.website}/u/${activeBrand.slug}`,
                      )
                  : undefined
              }
            />
          </Card>

          {activeBrand.text ? (
            <Card className="bg-card/80 backdrop-blur-sm" bodyClassName="p-6">
              <BrandDetailSystemPrompt
                text={activeBrand.text}
                onCopy={onCopy}
              />
            </Card>
          ) : null}
        </div>

        <div className="xl:col-span-4">
          <div className="space-y-6">
            <BrandDetailSidebar
              brand={activeBrand}
              brandId={activeBrand.id}
              links={(activeBrand.links || []) as unknown as ILink[]}
              socialConnections={socialConnections}
              connectedPlatformsCount={connectedPlatformsCount}
              deletingRefId={null}
              onTogglePublicProfile={(isPublic) =>
                onTogglePublicProfile(isPublic)
              }
              onRefreshBrand={onRefreshBrand}
              onOpenLinkModal={onOpenLinkModal}
              onUploadReference={onUploadReference}
              onDeleteReference={onDeleteReference}
            />

            {isLinkEditorOpen ? (
              <BrandDetailLinkEditor
                error={linkEditorError}
                isSubmitting={isSubmittingLink}
                isEditing={Boolean(selectedLink)}
                values={linkFormValues}
                onChange={onLinkFieldChange}
                onCancel={onLinkCancel}
                onDelete={onLinkDelete}
                onSubmit={onLinkSubmit}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
