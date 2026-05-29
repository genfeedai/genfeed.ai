'use client';

import type { IngredientListProps } from '@genfeedai/props/content/ingredient.props';
import { SkeletonMasonryGrid } from '@ui/display/skeleton/skeleton';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

// Grid doesn't need viewport detection (it's the container)
export const LazyMasonryGrid = dynamic(
  () => import('@ui/masonry/grid/MasonryGrid'),
  {
    loading: () => <SkeletonMasonryGrid count={8} />,
    ssr: false,
  },
) as ComponentType<IngredientListProps>;
