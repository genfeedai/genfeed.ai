'use client';

import {
  AssetCategory,
  AssetScope,
  ButtonSize,
  ButtonVariant,
  ModalEnum,
} from '@genfeedai/enums';
import type { BrandOverlayProps } from '@genfeedai/props/modals/modal.props';
import { LazyModalBrandGenerate } from '@ui/lazy/modal/LazyModal';
import EntityOverlayShell from '@ui/overlays/entity/EntityOverlayShell';
import { Button } from '@ui/primitives/button';
import BrandEditorForm from './BrandEditorForm';
import BrandOverviewPanel from './BrandOverviewPanel';
import { useModalBrand } from './useModalBrand';

export default function BrandOverlay({
  brand,
  onConfirm,
  isOpen,
  openKey,
  onClose,
  initialView = 'edit',
}: BrandOverlayProps) {
  const {
    activeBrand,
    connectedPlatformsCount,
    editorTab,
    error,
    fontFamilies,
    form,
    generateCost,
    generateModalType,
    imageModels,
    isGenerating,
    isLinkEditorOpen,
    isLoadingBrand,
    isSubmitting,
    isSubmittingLink,
    linkEditorError,
    linkFormValues,
    musicModels,
    navigateToBrandSettings,
    organizationDefaults,
    overlayDescription,
    overlayTitle,
    overlayView,
    previousPrompt,
    selectedLink,
    socialConnections,
    videoModels,
    closeLinkEditor,
    closeModalBrand,
    enhanceDescription,
    handleCopy,
    handleCopyPrompt,
    handleDismiss,
    handleGenerateBanner,
    handleGenerateConfirm,
    handleGenerateLogo,
    handleLinkDelete,
    handleLinkFieldChange,
    handleLinkSubmit,
    handleOpenLinkModal,
    handleOpenUploadModal,
    handleRequestDeleteReference,
    handleUpdateBrandField,
    onChange,
    onSubmit,
    onUndo,
    refreshBrand,
    setEditorTab,
    setOverlayView,
  } = useModalBrand({
    brand,
    isOpen,
    onClose,
    onConfirm,
    openKey,
    initialView,
  });

  return (
    <>
      <EntityOverlayShell
        id={ModalEnum.BRAND}
        title={overlayTitle}
        description={overlayDescription}
        width={activeBrand ? '2xl' : 'xl'}
        surface="flat"
        onClose={closeModalBrand}
        onOpenDetail={navigateToBrandSettings}
        badges={
          activeBrand ? (
            <>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-foreground/55">
                Brand
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-foreground/70">
                {activeBrand.scope === AssetScope.PUBLIC ? 'Public' : 'Private'}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-foreground/70">
                {connectedPlatformsCount} connected
              </span>
            </>
          ) : (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-foreground/55">
              New Brand
            </span>
          )
        }
        actions={
          activeBrand ? (
            <div className="flex items-center gap-2">
              {overlayView === 'overview' ? (
                <Button
                  label="Edit"
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  onClick={() => setOverlayView('edit')}
                />
              ) : (
                <Button
                  label="Overview"
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  onClick={() => setOverlayView('overview')}
                />
              )}
            </div>
          ) : null
        }
      >
        {isLoadingBrand && !activeBrand ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <span className="text-sm text-foreground/60">Loading brand…</span>
          </div>
        ) : null}

        {!isLoadingBrand || activeBrand ? (
          overlayView === 'edit' || !activeBrand ? (
            <div className="mx-auto w-full max-w-5xl">
              <BrandEditorForm
                activeBrand={activeBrand}
                editorTab={editorTab}
                error={error}
                fontFamilies={fontFamilies}
                form={form}
                imageModels={imageModels}
                isGenerating={isGenerating}
                isSubmitting={isSubmitting}
                musicModels={musicModels}
                onCancel={() => {
                  if (activeBrand) {
                    setOverlayView('overview');
                    return;
                  }

                  handleDismiss();
                }}
                onChange={onChange}
                onEnhanceDescription={enhanceDescription}
                onSubmit={onSubmit}
                onTabChange={setEditorTab}
                onUndo={onUndo}
                onCopyPrompt={handleCopyPrompt}
                organizationDefaults={organizationDefaults}
                previousPrompt={previousPrompt}
                videoModels={videoModels}
              />
            </div>
          ) : (
            <BrandOverviewPanel
              activeBrand={activeBrand}
              connectedPlatformsCount={connectedPlatformsCount}
              error={error}
              isLinkEditorOpen={isLinkEditorOpen}
              isSubmittingLink={isSubmittingLink}
              linkEditorError={linkEditorError}
              linkFormValues={linkFormValues}
              selectedLink={selectedLink}
              socialConnections={socialConnections}
              onCopy={handleCopy}
              onDeleteReference={handleRequestDeleteReference}
              onEditBrand={() => setOverlayView('edit')}
              onGenerateBanner={handleGenerateBanner}
              onGenerateLogo={handleGenerateLogo}
              onLinkCancel={closeLinkEditor}
              onLinkDelete={handleLinkDelete}
              onLinkFieldChange={handleLinkFieldChange}
              onLinkSubmit={handleLinkSubmit}
              onOpenLinkModal={handleOpenLinkModal}
              onRefreshBrand={async () => {
                await refreshBrand();
                onConfirm?.(true);
              }}
              onTogglePublicProfile={(isPublic) =>
                void handleUpdateBrandField(
                  'scope',
                  isPublic ? AssetScope.PUBLIC : AssetScope.BRAND,
                )
              }
              onUploadBanner={() => handleOpenUploadModal(AssetCategory.BANNER)}
              onUploadLogo={() => handleOpenUploadModal(AssetCategory.LOGO)}
              onUploadReference={() =>
                handleOpenUploadModal(AssetCategory.REFERENCE)
              }
            />
          )
        ) : null}
      </EntityOverlayShell>

      {activeBrand && generateModalType ? (
        <LazyModalBrandGenerate
          type={generateModalType}
          cost={generateCost}
          brandId={activeBrand.id}
          onConfirm={() => {
            void handleGenerateConfirm();
          }}
        />
      ) : null}
    </>
  );
}
