'use client';

import { IngredientFormat } from '@genfeedai/enums';
import type { IngredientListProps } from '@props/content/ingredient.props';
import type {
  MasonryImageProps,
  MasonryVideoProps,
} from '@props/content/masonry.props';
import { SkeletonMasonryGrid } from '@ui/display/skeleton/skeleton';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

// Code-split the heavy masonry components
const MasonryImageComponent = dynamic(
  () => import('@ui/masonry/image/MasonryImage'),
  {
    loading: () => (
      <LazyLoadingFallback
        variant="skeleton"
        aspectRatio={IngredientFormat.SQUARE}
        isSpinnerEnabled={true}
      />
    ),
    ssr: false,
  },
);

const MasonryVideoComponent = dynamic(
  () => import('@ui/masonry/video/MasonryVideo'),
  {
    loading: () => (
      <LazyLoadingFallback
        variant="skeleton"
        aspectRatio={IngredientFormat.LANDSCAPE}
        isSpinnerEnabled={true}
      />
    ),
    ssr: false,
  },
);

// Render masonry image directly — LazyLoad's IntersectionObserver doesn't fire
// inside nested overflow containers, causing images to never load
export function LazyMasonryImage(props: MasonryImageProps) {
  return <MasonryImageComponent {...props} />;
}

// Render masonry video directly — same overflow container issue as images
export function LazyMasonryVideo(props: MasonryVideoProps) {
  return <MasonryVideoComponent {...props} />;
}

// Grid doesn't need viewport detection (it's the container)
export const LazyMasonryGrid = dynamic(
  () => import('@ui/masonry/grid/MasonryGrid'),
  {
    loading: () => <SkeletonMasonryGrid count={8} />,
    ssr: false,
  },
) as ComponentType<IngredientListProps>;
