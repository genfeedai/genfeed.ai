'use client';

import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { IngredientsListFooterProps } from '@genfeedai/props/pages/ingredients-list.props';
import MediaLightbox from '@ui/layouts/lightbox/MediaLightbox';
import { LazyModalFolder } from '@ui/lazy/modal/LazyModal';

export default function IngredientsListFooter({
  scope,
  brandId,
  mediaIngredients,
  lightboxOpen,
  lightboxIndex,
  onCloseLightbox,
  selectedFolderForModal,
  onFolderModalConfirm,
  showFolderModal = true,
}: IngredientsListFooterProps) {
  return (
    <>
      {mediaIngredients.length > 0 && (
        <MediaLightbox
          startIndex={lightboxIndex}
          open={lightboxOpen}
          onClose={onCloseLightbox}
          items={mediaIngredients as IIngredient[]}
        />
      )}

      {showFolderModal ? (
        <LazyModalFolder
          item={selectedFolderForModal}
          onConfirm={onFolderModalConfirm}
          brandId={brandId || undefined}
          scope={scope}
        />
      ) : null}
    </>
  );
}
