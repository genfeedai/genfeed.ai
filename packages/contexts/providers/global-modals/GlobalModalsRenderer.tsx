'use client';

import type { SubscriptionTier } from '@genfeedai/contracts';
import type {
  GlobalModalRenderer,
  GlobalModalsProviderProps,
} from '@genfeedai/props/modals/global-modals.props';
import {
  LazyBrandOverlay,
  LazyIngredientOverlay,
  LazyModalConfirm,
  LazyModalCredential,
  LazyModalExport,
  LazyModalGallery,
  LazyModalGenerateIllustration,
  LazyModalMetadata,
  LazyModalPostBatch,
  LazyModalPostRemix,
  LazyModalPostRepurpose,
  LazyModalPrompt,
  LazyModalUpload,
  LazyPostMetadataOverlay,
} from '@ui/lazy/modal/LazyModal';
import { ModalUpgradePrompt } from '@ui/modals';
import type { useGlobalModalsState } from './useGlobalModalsState';

type GlobalModalsRendererProps = ReturnType<typeof useGlobalModalsState> &
  Pick<GlobalModalsProviderProps, 'renderModal'>;

const renderUnwrappedModal: GlobalModalRenderer = (_kind, children) => children;

export default function GlobalModalsRenderer({
  renderModal = renderUnwrappedModal,
  brandOverlayData,
  brandOverlayTrigger,
  closeBrandOverlay,
  closePublishModal,
  closeConfirm,
  closeCredentialModal,
  closeExport,
  closeGallery,
  closeGenerateIllustration,
  closeIngredientOverlay,
  closePostMetadataOverlay,
  closePostRemixModal,
  closePostRepurposeModal,
  closePromptModal,
  closeUpload,
  credentials,
  credentialData,
  credentialTrigger,
  currentConfirm,
  exportConfig,
  galleryConfig,
  generateIllustrationConfig,
  generateIllustrationTrigger,
  handleBrandOverlayConfirm,
  ingredientOverlayData,
  ingredientOverlayTrigger,
  metadataConfig,
  openTrigger,
  postMetadataOverlayData,
  postRemixData,
  postRemixTrigger,
  postRepurposeData,
  postRepurposeTrigger,
  promptConfig,
  publishIngredient,
  publishIngredients,
  settings,
  uploadConfig,
  uploadTrigger,
}: GlobalModalsRendererProps) {
  return (
    <>
      {/* Mounted only while open, like the other modals: rendering it closed
          still downloads its chunk on every protected page. */}
      {publishIngredients.length > 0 &&
        renderModal(
          'postBatch',
          <LazyModalPostBatch
            key={openTrigger}
            ingredient={publishIngredient || undefined}
            ingredients={
              publishIngredients.length > 1 ? publishIngredients : undefined
            }
            credentials={credentials}
            onConfirm={closePublishModal}
            isOpen
            openKey={openTrigger}
          />,
        )}

      {currentConfirm &&
        renderModal(
          'confirm',
          <LazyModalConfirm
            key={currentConfirm.id}
            label={currentConfirm.label}
            message={currentConfirm.message}
            confirmLabel={currentConfirm.confirmLabel}
            cancelLabel={currentConfirm.cancelLabel}
            isError={currentConfirm.isError}
            isOpen={Boolean(currentConfirm)}
            openKey={currentConfirm.id}
            onClose={closeConfirm}
            onConfirm={async () => {
              await currentConfirm.onConfirm();
              closeConfirm();
            }}
          >
            {currentConfirm.children}
          </LazyModalConfirm>,
        )}

      {uploadConfig &&
        renderModal(
          'upload',
          <LazyModalUpload
            key={uploadTrigger}
            isOpen={Boolean(uploadConfig)}
            openKey={uploadTrigger}
            category={uploadConfig.category}
            parentId={uploadConfig.parentId}
            parentModel={uploadConfig.parentModel}
            width={uploadConfig.width}
            height={uploadConfig.height}
            isResizeEnabled={uploadConfig.isResizeEnabled}
            isMultiple={uploadConfig.isMultiple}
            maxFiles={uploadConfig.maxFiles}
            initialFiles={uploadConfig.initialFiles}
            autoSubmit={uploadConfig.autoSubmit}
            onComplete={(ingredients) => {
              uploadConfig.onComplete?.(ingredients);
              closeUpload();
            }}
          />,
        )}

      {galleryConfig &&
        renderModal(
          'gallery',
          <LazyModalGallery
            isOpen={galleryConfig.isOpen}
            category={galleryConfig.category}
            title={galleryConfig.title}
            selectedId={galleryConfig.selectedId}
            format={galleryConfig.format}
            isFormatFilterEnabled={galleryConfig.isFormatFilterEnabled}
            isNoneAllowed={galleryConfig.isNoneAllowed}
            maxSelectableItems={galleryConfig.maxSelectableItems}
            accountReference={galleryConfig.accountReference}
            onSelectAccountReference={galleryConfig.onSelectAccountReference}
            selectedReferences={galleryConfig.selectedReferences}
            onClose={closeGallery}
            onSelect={(items) => {
              galleryConfig.onSelect(items);
              closeGallery();
            }}
          />,
        )}

      {ingredientOverlayData?.ingredient &&
        renderModal(
          'ingredient',
          <LazyIngredientOverlay
            key={ingredientOverlayTrigger}
            isOpen={Boolean(ingredientOverlayData.ingredient)}
            openKey={ingredientOverlayTrigger}
            ingredient={ingredientOverlayData.ingredient}
            onConfirm={() => {
              ingredientOverlayData.onConfirm?.();
            }}
            onClose={closeIngredientOverlay}
          />,
        )}

      {exportConfig &&
        renderModal(
          'export',
          <LazyModalExport
            isOpen={Boolean(exportConfig)}
            onExport={(format, fields) => {
              exportConfig.onExport(format, fields);
              closeExport();
            }}
          />,
        )}

      {credentialData &&
        renderModal(
          'credential',
          <LazyModalCredential
            key={credentialTrigger}
            isOpen={Boolean(credentialData)}
            openKey={credentialTrigger}
            credential={credentialData.credential}
            onConfirm={() => {
              credentialData.onConfirm();
              closeCredentialModal();
            }}
          />,
        )}

      {promptConfig &&
        renderModal(
          'prompt',
          <LazyModalPrompt
            isOpen={Boolean(promptConfig)}
            originalPrompt={promptConfig.originalPrompt}
            enhancedPrompt={promptConfig.enhancedPrompt}
            style={promptConfig.style}
            mood={promptConfig.mood}
            camera={promptConfig.camera}
            onUsePrompt={(promptData) => {
              promptConfig.onConfirm(promptData.text);
              closePromptModal();
            }}
          />,
        )}

      {metadataConfig &&
        renderModal(
          'metadata',
          <LazyModalMetadata
            isOpen={Boolean(metadataConfig)}
            ingredientId={metadataConfig.ingredientId}
            ingredientCategory={metadataConfig.ingredientCategory}
            metadata={metadataConfig.metadata}
            scope={metadataConfig.scope}
            folder={metadataConfig.folder}
            onConfirm={metadataConfig.onConfirm}
          />,
        )}

      {brandOverlayData &&
        renderModal(
          'brand',
          <LazyBrandOverlay
            key={brandOverlayTrigger}
            isOpen={Boolean(brandOverlayData)}
            openKey={brandOverlayTrigger}
            brand={brandOverlayData.brand}
            initialView={brandOverlayData.initialView}
            onConfirm={handleBrandOverlayConfirm}
            onClose={closeBrandOverlay}
          />,
        )}

      {postMetadataOverlayData?.post &&
        renderModal(
          'postMetadata',
          <LazyPostMetadataOverlay
            post={postMetadataOverlayData.post}
            onConfirm={() => {
              postMetadataOverlayData.onConfirm?.();
              closePostMetadataOverlay();
            }}
            onClose={closePostMetadataOverlay}
          />,
        )}

      {generateIllustrationConfig &&
        renderModal(
          'illustration',
          <LazyModalGenerateIllustration
            key={generateIllustrationTrigger}
            isOpen={Boolean(generateIllustrationConfig)}
            openKey={generateIllustrationTrigger}
            postId={generateIllustrationConfig.postId}
            initialPrompt={generateIllustrationConfig.initialPrompt}
            platform={generateIllustrationConfig.platform}
            onConfirm={(imageId) => {
              generateIllustrationConfig.onConfirm(imageId);
              closeGenerateIllustration();
            }}
            onClose={closeGenerateIllustration}
          />,
        )}

      <ModalUpgradePrompt
        currentTier={settings?.subscriptionTier as SubscriptionTier | undefined}
      />
      <ModalUpgradePrompt reason="credits" />

      {postRemixData &&
        renderModal(
          'postRemix',
          <LazyModalPostRemix
            key={postRemixTrigger}
            isOpen={Boolean(postRemixData)}
            openKey={postRemixTrigger}
            post={postRemixData.post}
            onSubmit={async (description, label) => {
              await postRemixData.onSubmit(description, label);
              closePostRemixModal();
            }}
            onClose={closePostRemixModal}
          />,
        )}

      {postRepurposeData &&
        renderModal(
          'postRepurpose',
          <LazyModalPostRepurpose
            key={postRepurposeTrigger}
            isOpen={Boolean(postRepurposeData)}
            openKey={postRepurposeTrigger}
            source={postRepurposeData.source}
            onSubmit={async (platform, mode) => {
              await postRepurposeData.onSubmit(platform, mode);
              closePostRepurposeModal();
            }}
            onClose={closePostRepurposeModal}
          />,
        )}
    </>
  );
}
