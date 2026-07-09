'use client';

import {
  AlertCategory,
  AssetCategory,
  AssetScope,
  ButtonSize,
  ButtonVariant,
  ModalEnum,
} from '@genfeedai/enums';
import type { BrandOverlayProps } from '@genfeedai/props/modals/modal.props';
import Alert from '@ui/feedback/alert/Alert';
import { LazyModalBrandGenerate } from '@ui/lazy/modal/LazyModal';
import { Modal } from '@ui/modals/compound/modal.compound';
import EntityOverlayShell from '@ui/overlays/entity/EntityOverlayShell';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import type { ChangeEvent } from 'react';
import { useState } from 'react';
import BrandEditorForm from './BrandEditorForm';
import BrandOverviewPanel from './BrandOverviewPanel';
import { useModalBrand } from './useModalBrand';

function slugifyBrandLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function BrandOverlay({
  brand,
  onConfirm,
  isOpen,
  openKey,
  onClose,
  initialView = 'edit',
}: BrandOverlayProps) {
  const [isCreateSlugDirty, setIsCreateSlugDirty] = useState(false);
  const {
    activeBrand,
    canMoveOrganization,
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
    organizationOptions,
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

  const handleCreateFieldChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    onChange(event);

    if (name === 'slug') {
      setIsCreateSlugDirty(true);
      return;
    }

    if (name === 'label' && !isCreateSlugDirty) {
      form.setValue('slug', slugifyBrandLabel(value), {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  };

  if (!brand && !activeBrand) {
    return (
      <Modal.Root
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeModalBrand();
          }
        }}
      >
        <Modal.Content
          size="md"
          className="border-white/10 bg-secondary"
          aria-describedby="brand-create-description"
        >
          <Modal.Header>
            <Modal.Title>New brand</Modal.Title>
            <Modal.Description id="brand-create-description">
              Create the brand, then continue setup from its brand page.
            </Modal.Description>
          </Modal.Header>

          <form onSubmit={onSubmit}>
            <Modal.Body className="space-y-4">
              {error ? (
                <Alert type={AlertCategory.ERROR}>
                  <div className="space-y-1">{error}</div>
                </Alert>
              ) : null}

              <FormControl label="Label" isRequired>
                <Input
                  type="text"
                  name="label"
                  control={form.control}
                  onChange={handleCreateFieldChange}
                  placeholder="Acme"
                  isRequired
                  isDisabled={isSubmitting}
                />
              </FormControl>

              <FormControl label="Slug" isRequired>
                <Input
                  type="text"
                  name="slug"
                  control={form.control}
                  onChange={handleCreateFieldChange}
                  placeholder="acme"
                  isRequired
                  isDisabled={isSubmitting}
                />
              </FormControl>

              <FormControl label="Description">
                <Input
                  type="text"
                  name="description"
                  control={form.control}
                  onChange={handleCreateFieldChange}
                  placeholder="What this brand is about"
                  isDisabled={isSubmitting}
                />
              </FormControl>
            </Modal.Body>

            <Modal.Footer>
              <Modal.CloseButton asChild>
                <Button
                  variant={ButtonVariant.SECONDARY}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
              </Modal.CloseButton>
              <Button
                type="submit"
                variant={ButtonVariant.DEFAULT}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating…' : 'Create brand'}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Content>
      </Modal.Root>
    );
  }

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
              <span className="gen-label rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-foreground/55">
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
            <span className="gen-label rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-foreground/55">
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
                canMoveOrganization={canMoveOrganization}
                editorTab={editorTab}
                error={error}
                fontFamilies={fontFamilies}
                form={form}
                imageModels={imageModels}
                isGenerating={isGenerating}
                isSubmitting={isSubmitting}
                musicModels={musicModels}
                organizationOptions={organizationOptions}
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
