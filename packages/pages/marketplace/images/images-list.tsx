'use client';

import {
  GALLERY_CONTAINER_PADDING,
  GALLERY_EMPTY_MESSAGES,
  GALLERY_EMPTY_SIZE,
} from '@genfeedai/constants';
import type { IngredientFormat } from '@genfeedai/enums';
import type { IImage, IIngredient } from '@genfeedai/interfaces';
import { useGalleryList } from '@hooks/data/gallery/use-gallery-list/use-gallery-list';
import CardEmpty from '@ui/card/empty/CardEmpty';
import { LazyMasonryGrid } from '@ui/lazy/masonry/LazyMasonry';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { HiPhoto } from 'react-icons/hi2';

export default function ImagesList(): ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formatParam = searchParams?.get('format') as IngredientFormat | null;

  const queryParams = useMemo(
    () => (formatParam ? { format: formatParam } : {}),
    [formatParam],
  );

  const { items: images, isLoading } = useGalleryList<IImage>({
    queryParams,
    type: 'images',
  });

  function handleClickImage(ingredient: IIngredient): void {
    router.push(`/images/${ingredient.id}`);
  }

  if (images.length === 0 && !isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <CardEmpty
          icon={HiPhoto}
          label={GALLERY_EMPTY_MESSAGES.images.label}
          description={GALLERY_EMPTY_MESSAGES.images.description}
          action={{
            label: 'Create Image',
            onClick: () => router.push('/studio'),
          }}
          size={GALLERY_EMPTY_SIZE}
        />
      </div>
    );
  }

  return (
    <div className={`${GALLERY_CONTAINER_PADDING} w-full`}>
      <LazyMasonryGrid
        ingredients={images}
        selectedIngredientId={[]}
        isActionsEnabled={false}
        isLoading={isLoading}
        onClickIngredient={handleClickImage}
      />
    </div>
  );
}
