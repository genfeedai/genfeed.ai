'use client';

import type { SubscriptionTier } from '@genfeedai/enums';
import type { IAsset, IImage, IMusic } from '@genfeedai/interfaces';
import {
  LazyBrandOverlay,
  LazyIngredientOverlay,
  LazyModalConfirm,
  LazyModalCredential,
  LazyModalExport,
  LazyModalGallery,
  LazyModalGenerateIllustration,
  LazyModalMetadata,
  LazyModalPost,
  LazyModalPostBatch,
  LazyModalPostRemix,
  LazyModalPrompt,
  LazyModalUpload,
  LazyPostMetadataOverlay,
} from '@ui/lazy/modal/LazyModal';
import { ModalUpgradePrompt } from '@ui/modals';
import type { GallerySelectItem } from './global-modals.provider';
import type { useGlobalModalsState } from './useGlobalModalsState';

type GlobalModalsRendererProps = ReturnType<typeof useGlobalModalsState>;

export default function GlobalModalsRenderer({
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
  handlePostConfirm,
  handlePostCreated,
  ingredientOverlayData,
  ingredientOverlayTrigger,
  metadataConfig,
  openTrigger,
  postMetadataOverlayData,
  postRemixData,
  postRemixTrigger,
  promptConfig,
  publishIngredient,
  publishIngredients,
  settings,
  uploadConfig,
  uploadTrigger,
}: GlobalModalsRendererProps) {
  return (
    <>
      <LazyModalPost
        credentials={credentials}
        onConfirm={handlePostConfirm}
        onCreated={handlePostCreated}
      />

      <LazyModalPostBatch
        key={openTrigger}
        ingredient={publishIngredient || undefined}
        ingredients={
          publishIngredients.length > 1 ? publishIngredients : undefined
        }
        credentials={credentials}
        onConfirm={closePublishModal}
        isOpen={publishIngredients.length > 0}
        openKey={openTrigger}
      />

      {currentConfirm && (
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
        />
      )}

      {uploadConfig && (
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
          onConfirm={(ingredient) => {
            uploadConfig.onConfirm?.(ingredient);
            closeUpload();
          }}
          onComplete={(ingredients) => {
            uploadConfig.onComplete?.(ingredients);
          }}
        />
      )}

      {galleryConfig && (
        <LazyModalGallery
          isOpen={galleryConfig.isOpen}
          category={galleryConfig.category}
          title={galleryConfig.title}
          selectedId={galleryConfig.selectedId}
          format={galleryConfig.format}
          isNoneAllowed={galleryConfig.isNoneAllowed}
          maxSelectableItems={galleryConfig.maxSelectableItems}
          accountReference={galleryConfig.accountReference}
          onSelectAccountReference={galleryConfig.onSelectAccountReference}
          selectedReferences={galleryConfig.selectedReferences}
          onClose={closeGallery}
          onSelect={(
            item: IAsset | IImage | IMusic | (IAsset | IImage)[] | null,
          ) => {
            galleryConfig.onSelect(
              item as GallerySelectItem | GallerySelectItem[] | null,
            );
            closeGallery();
          }}
        />
      )}

      {ingredientOverlayData?.ingredient && (
        <LazyIngredientOverlay
          key={ingredientOverlayTrigger}
          isOpen={Boolean(ingredientOverlayData.ingredient)}
          openKey={ingredientOverlayTrigger}
          ingredient={ingredientOverlayData.ingredient}
          onConfirm={() => {
            ingredientOverlayData.onConfirm?.();
          }}
          onClose={closeIngredientOverlay}
        />
      )}

      {exportConfig && (
        <LazyModalExport
          isOpen={Boolean(exportConfig)}
          onExport={(format, fields) => {
            exportConfig.onExport(format, fields);
            closeExport();
          }}
        />
      )}

      {credentialData && (
        <LazyModalCredential
          key={credentialTrigger}
          isOpen={Boolean(credentialData)}
          openKey={credentialTrigger}
          credential={credentialData.credential}
          onConfirm={() => {
            credentialData.onConfirm();
            closeCredentialModal();
          }}
        />
      )}

      {promptConfig && (
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
        />
      )}

      {metadataConfig && (
        <LazyModalMetadata
          isOpen={Boolean(metadataConfig)}
          ingredientId={metadataConfig.ingredientId}
          ingredientCategory={metadataConfig.ingredientCategory}
          metadata={metadataConfig.metadata}
          scope={metadataConfig.scope}
          folder={metadataConfig.folder}
          onConfirm={metadataConfig.onConfirm}
        />
      )}

      {brandOverlayData && (
        <LazyBrandOverlay
          key={brandOverlayTrigger}
          isOpen={Boolean(brandOverlayData)}
          openKey={brandOverlayTrigger}
          brand={brandOverlayData.brand}
          initialView={brandOverlayData.initialView}
          onConfirm={handleBrandOverlayConfirm}
          onClose={closeBrandOverlay}
        />
      )}

      {postMetadataOverlayData?.post && (
        <LazyPostMetadataOverlay
          post={postMetadataOverlayData.post}
          onConfirm={() => {
            postMetadataOverlayData.onConfirm?.();
            closePostMetadataOverlay();
          }}
          onClose={closePostMetadataOverlay}
        />
      )}

      {generateIllustrationConfig && (
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
        />
      )}

      <ModalUpgradePrompt
        currentTier={settings?.subscriptionTier as SubscriptionTier | undefined}
      />

      {postRemixData && (
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
        />
      )}
    </>
  );
}
