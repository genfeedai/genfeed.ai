'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getIngredientPreviewUrl } from '@genfeedai/utils/media/ingredient-preview.util';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { IngredientsService } from '@services/content/ingredients.service';
import type { AppRailPreviewContentProps } from '@/props/ui/app-rail.props';
import type { AppRailPreviewMediaProps } from '@/props/ui/app-rail-preview.props';
import {
  RailPreviewSection,
  RailPreviewState,
  RailPreviewThumbnailGrid,
} from './rail-preview-parts';

const PREVIEW_LIMIT = 8;

/**
 * Newest media of the brand, or of every brand when none is selected: the
 * body of both Library (everything) and Playground (generated images and
 * videos).
 */
export default function MediaRailPreview({
  categories,
  emptyLabel,
  href,
  queryScope,
  title,
}: AppRailPreviewContentProps & AppRailPreviewMediaProps) {
  const { brandId } = useBrand();
  const media = useAuthedQuery<
    IngredientsService,
    { id: string; src: string; title: string }[]
  >({
    queryFn: async (service, signal) => {
      const page = await service.findAllPage(
        {
          ...(categories ? { categories } : {}),
          ...(brandId ? { brandId } : { allBrands: true }),
          limit: PREVIEW_LIMIT,
          sort: 'createdAt: -1',
        },
        signal,
      );
      return page.items.flatMap((ingredient) => {
        const src = getIngredientPreviewUrl(ingredient);
        return src
          ? [
              {
                id: ingredient.id,
                src,
                title: ingredient.metadataLabel || ingredient.category,
              },
            ]
          : [];
      });
    },
    queryKey: [
      'app-rail-preview',
      queryScope,
      brandId || null,
      categories ?? null,
    ],
    service: (token: string) => IngredientsService.getInstance(token),
    staleTime: 30_000,
  });
  const items = media.data ?? [];

  return (
    <RailPreviewSection title={title}>
      <RailPreviewState
        emptyLabel={emptyLabel}
        isEmpty={items.length === 0}
        isError={media.isError}
        isLoading={media.isPending}
        skeletonRows={2}
      >
        <RailPreviewThumbnailGrid
          items={items.map((item) => ({
            alt: item.title,
            href,
            id: item.id,
            src: item.src,
          }))}
        />
      </RailPreviewState>
    </RailPreviewSection>
  );
}
