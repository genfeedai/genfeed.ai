'use client';

import type { IIngredient } from '@genfeedai/interfaces';
import type { IngredientsListFooterProps } from '@props/pages/ingredients-list.props';
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

      <LazyModalFolder
        item={selectedFolderForModal}
        onConfirm={onFolderModalConfirm}
        brandId={brandId || undefined}
        scope={scope}
      />
    </>
  );
}
