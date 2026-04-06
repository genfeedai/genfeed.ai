'use client';

import {
  GALLERY_CONTAINER_PADDING,
  GALLERY_EMPTY_MESSAGES,
  GALLERY_EMPTY_SIZE,
} from '@genfeedai/constants';
import { AssetScope, IngredientFormat } from '@genfeedai/enums';
import type { IVideo } from '@genfeedai/interfaces';
import { useGalleryList } from '@hooks/data/gallery/use-gallery-list/use-gallery-list';
import CardEmpty from '@ui/card/empty/CardEmpty';
import { LazyMasonryGrid } from '@ui/lazy/masonry/LazyMasonry';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { HiVideoCamera } from 'react-icons/hi2';

export default function VideosList(): ReactNode {
  const router = useRouter();

  const queryParams = useMemo(
    () => ({
      format: IngredientFormat.PORTRAIT,
      scope: AssetScope.PUBLIC,
    }),
    [],
  );

  const { items: videos, isLoading } = useGalleryList<IVideo>({
    queryParams,
    type: 'videos',
  });

  if (videos.length === 0 && !isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <CardEmpty
          icon={HiVideoCamera}
          label={GALLERY_EMPTY_MESSAGES.videos.label}
          description={GALLERY_EMPTY_MESSAGES.videos.description}
          size={GALLERY_EMPTY_SIZE}
          action={{
            label: 'Create Video',
            onClick: () => router.push('/studio'),
          }}
        />
      </div>
    );
  }

  return (
    <div className={`${GALLERY_CONTAINER_PADDING} w-full`}>
      <LazyMasonryGrid
        ingredients={videos}
        selectedIngredientId={[]}
        isActionsEnabled={false}
        isLoading={isLoading}
      />
    </div>
  );
}
