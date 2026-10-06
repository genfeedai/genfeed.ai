'use client';

import { AssetCategory, ButtonVariant, MemberRole } from '@genfeedai/contracts';
import type {
  BrandKitFieldGroup,
  IBrandKitDraft,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useUserRole } from '@hooks/auth/use-user-role/use-user-role';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import BrandKitReviewCard from '@pages/brands/components/brand-kit/BrandKitReviewCard';
import BrandKitWorkspace from '@pages/brands/components/brand-kit/BrandKitWorkspace';
import BrandOsSettingsCard from '@pages/brands/components/brand-kit/BrandOsSettingsCard';
import BrandWritingVoiceEditor from '@pages/brands/components/brand-kit/writing-voice/BrandWritingVoiceEditor';
import BrandDetailManualKitCard from '@pages/brands/components/sidebar/BrandDetailManualKitCard';
import BrandDetailReferencesCard from '@pages/brands/components/sidebar/BrandDetailReferencesCard';
import BrandWatermarkSettings from '@pages/brands/components/sidebar/BrandWatermarkSettings';
import { BrandsService } from '@services/social/brands.service';
import BrandCompletenessCard from '@ui/cards/brand-completeness-card/BrandCompletenessCard';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { captureBrandOsFunnelStage } from '@/lib/analytics';

const FIELD_GROUPS: Record<string, readonly BrandKitFieldGroup[]> = {
  overview: ['profile', 'links'],
  visual: ['visual'],
  voice: ['voice'],
  strategy: ['strategy'],
};

export default function BrandKitPage() {
  const t = useTranslations('pages.brandKitSettings');
  const role = useUserRole();
  const canManage = role === MemberRole.OWNER || role === MemberRole.ADMIN;
  const [refreshKey, setRefreshKey] = useState(0);
  const [workflow, setWorkflow] = useState<'scan' | 'manual' | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requestedTab = params.get('tab') ?? 'overview';
  const tab = Object.hasOwn(FIELD_GROUPS, requestedTab)
    ? requestedTab
    : 'overview';
  const { href } = useOrgUrl();
  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
  const {
    brand,
    brandId,
    hasBrandId,
    isLoading,
    deletingRefId,
    handleOpenUploadModal,
    handleRequestDeleteReference,
    handleRefreshBrand,
  } = useBrandDetail();

  async function persistRevision(draft: IBrandKitDraft) {
    const service = await getBrandsService();
    await service.createBrandOsRevision(brandId, draft);
    setRefreshKey((value) => value + 1);
  }

  if (!hasBrandId || isLoading) return <Loading isFullSize={false} />;
  if (!brand)
    return (
      <Container>
        <p className="text-sm text-muted-foreground">{t('brandMissing')}</p>
      </Container>
    );

  const scan = (
    <BrandKitReviewCard
      brand={brand}
      brandId={brandId}
      loadClaimedBrandOsDraft
      onDraftCreated={canManage ? persistRevision : undefined}
      onBrandOsDraftAccepted={() => captureBrandOsFunnelStage('draft_accepted')}
      onBrandOsDraftLoaded={() => captureBrandOsFunnelStage('draft_saved')}
      onRefreshBrand={() => handleRefreshBrand(true)}
    />
  );
  const manual = (
    <BrandDetailManualKitCard
      brand={brand}
      brandId={brandId}
      onDraftCreated={canManage ? persistRevision : undefined}
      onRefreshBrand={() => handleRefreshBrand(true)}
      onUploadBanner={() => handleOpenUploadModal(AssetCategory.BANNER)}
      onUploadLogo={() => handleOpenUploadModal(AssetCategory.LOGO)}
      onUploadReference={() => handleOpenUploadModal(AssetCategory.REFERENCE)}
    />
  );

  return (
    <Container fullWidth>
      <BrandOsSettingsCard
        key={brandId}
        brandId={brandId}
        refreshKey={refreshKey}
        fieldGroups={FIELD_GROUPS[tab]}
        onRefreshBrand={() => handleRefreshBrand(true)}
        renderWorkspace={(workspace) => (
          <BrandKitWorkspace
            {...workspace}
            brand={brand}
            tab={tab}
            onTabChange={(next) => {
              const query = new URLSearchParams(params.toString());
              query.set('tab', next);
              router.replace(`${pathname}?${query.toString()}`, {
                scroll: false,
              });
            }}
            onScan={() => setWorkflow('scan')}
            onManualImport={() => setWorkflow('manual')}
            guidedSetupHref={href('/settings/brand-kit/guided-setup')}
            contentRulesHref={href('/settings/brand-kit/content-rules')}
            overview={
              <>
                <BrandCompletenessCard brand={brand} />
                {workspace.editor}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={ButtonVariant.SECONDARY}
                    isDisabled={workspace.isDirty}
                    onClick={() => setWorkflow('manual')}
                  >
                    {t('createManualDraft')}
                  </Button>
                </div>
                <Collapsible>
                  <CollapsibleTrigger>{t('capturedDraft')}</CollapsibleTrigger>
                  <CollapsibleContent
                    forceMount
                    className="data-[state=closed]:hidden"
                  >
                    <div inert={workspace.isDirty}>
                      {workflow === 'scan' ? null : scan}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </>
            }
            writingEditor={
              <BrandWritingVoiceEditor
                brand={brand}
                brandId={brandId}
                section={tab === 'strategy' ? 'strategy' : 'voice'}
                onRefreshBrand={() => handleRefreshBrand(true)}
              />
            }
            assets={
              <>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={ButtonVariant.SECONDARY}
                    onClick={() => handleOpenUploadModal(AssetCategory.LOGO)}
                  >
                    {t('replaceLogo')}
                  </Button>
                  <Button
                    variant={ButtonVariant.SECONDARY}
                    onClick={() => handleOpenUploadModal(AssetCategory.BANNER)}
                  >
                    {t('replaceBanner')}
                  </Button>
                </div>
                <BrandWatermarkSettings
                  brand={brand}
                  brandId={brandId}
                  onRefreshBrand={() => handleRefreshBrand(true)}
                />
                <BrandDetailReferencesCard
                  brand={brand}
                  deletingRefId={deletingRefId}
                  onUploadReference={() =>
                    handleOpenUploadModal(AssetCategory.REFERENCE)
                  }
                  onDeleteReference={handleRequestDeleteReference}
                />
              </>
            }
          />
        )}
      />
      <Sheet
        open={workflow !== null}
        onOpenChange={(open) => {
          if (!open) setWorkflow(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {workflow === 'scan' ? t('scan') : t('manualImport')}
            </SheetTitle>
          </SheetHeader>
          <div className="pt-4">{workflow === 'scan' ? scan : manual}</div>
        </SheetContent>
      </Sheet>
    </Container>
  );
}
