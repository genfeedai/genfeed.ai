'use client';

import { IngredientStatus } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useIngredientServices } from '@hooks/data/ingredients/use-ingredient-services/use-ingredient-services';
import type { Ingredient } from '@models/content/ingredient.model';
import { logger } from '@services/core/logger.service';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

const DEFAULT_LIBRARY_STATUSES = [
  IngredientStatus.GENERATED,
  IngredientStatus.PROCESSING,
  IngredientStatus.VALIDATED,
];

const VISUAL_PREVIEW_LIMIT = 3;

interface VisualBuckets {
  gifs: Ingredient[];
  images: Ingredient[];
  videos: Ingredient[];
}

function getVisualHref(item: Ingredient): string {
  switch (item.category) {
    case 'image':
      return '/library/images';
    case 'gif':
      return '/library/gifs';
    default:
      return '/library/videos';
  }
}

function LibraryPreviewTile({
  item,
  fallbackLabel,
  className,
}: {
  item?: Ingredient;
  fallbackLabel: string;
  className?: string;
}) {
  if (!item) {
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-[1.6rem] border border-white/[0.08] bg-white/[0.03] p-4',
          className,
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_45%)]" />
        <div className="relative flex h-full items-end">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
              Ready for
            </div>
            <div className="mt-1 text-lg font-semibold tracking-[-0.03em] text-white/88">
              {fallbackLabel}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={getVisualHref(item)}
      className={cn(
        'group relative overflow-hidden rounded-[1.6rem] border border-white/[0.08] bg-white/[0.03]',
        className,
      )}
    >
      <img
        src={item.ingredientUrl}
        alt={item.metadataLabel}
        className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.03]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
          {item.category}
        </div>
        <div className="mt-1 text-base font-semibold tracking-[-0.03em] text-white">
          {item.metadataLabel}
        </div>
      </div>
    </Link>
  );
}

export default function LibraryLandingVisualPreview() {
  const { getGifsService, getImagesService, getVideosService } =
    useIngredientServices();
  const [visualBuckets, setVisualBuckets] = useState<VisualBuckets>({
    gifs: [],
    images: [],
    videos: [],
  });

  useEffect(() => {
    const controller = new AbortController();

    async function loadVisuals() {
      try {
        const [videosResult, imagesResult, gifsResult] =
          await Promise.allSettled([
            getVideosService().then((service) =>
              service.findAll({
                limit: VISUAL_PREVIEW_LIMIT,
                status: DEFAULT_LIBRARY_STATUSES,
              }),
            ),
            getImagesService().then((service) =>
              service.findAll({
                limit: VISUAL_PREVIEW_LIMIT,
                status: DEFAULT_LIBRARY_STATUSES,
              }),
            ),
            getGifsService().then((service) =>
              service.findAll({
                limit: VISUAL_PREVIEW_LIMIT,
                status: DEFAULT_LIBRARY_STATUSES,
              }),
            ),
          ]);

        if (controller.signal.aborted) {
          return;
        }

        setVisualBuckets({
          gifs: gifsResult.status === 'fulfilled' ? gifsResult.value : [],
          images: imagesResult.status === 'fulfilled' ? imagesResult.value : [],
          videos: videosResult.status === 'fulfilled' ? videosResult.value : [],
        });

        [videosResult, imagesResult, gifsResult].forEach((result) => {
          if (result.status === 'rejected') {
            logger.error('Failed to load library visual previews', {
              error: result.reason,
              reportToSentry: false,
            });
          }
        });
      } catch (error) {
        logger.error('Failed to initialize library visual previews', {
          error,
          reportToSentry: false,
        });
      }
    }

    void loadVisuals();

    return () => {
      controller.abort();
    };
  }, [getGifsService, getImagesService, getVideosService]);

  const previewItems = useMemo(
    () =>
      [
        ...visualBuckets.videos,
        ...visualBuckets.images,
        ...visualBuckets.gifs,
      ].slice(0, 6),
    [visualBuckets],
  );

  const previewSlots = useMemo(
    () =>
      Array.from({ length: 6 }, (_, index) => previewItems[index] ?? undefined),
    [previewItems],
  );

  return (
    <div
      className="grid gap-3 lg:grid-cols-3"
      data-testid="library-visual-preview"
    >
      <div className="grid gap-3">
        <LibraryPreviewTile
          item={previewSlots[0]}
          fallbackLabel="Videos"
          className="aspect-[4/5]"
        />
        <LibraryPreviewTile
          item={previewSlots[3]}
          fallbackLabel="GIFs"
          className="aspect-[4/3]"
        />
      </div>
      <div className="grid gap-3">
        <LibraryPreviewTile
          item={previewSlots[1]}
          fallbackLabel="Images"
          className="aspect-[4/3]"
        />
        <LibraryPreviewTile
          item={previewSlots[4]}
          fallbackLabel="Visuals"
          className="aspect-[4/5]"
        />
      </div>
      <div className="grid gap-3">
        <LibraryPreviewTile
          item={previewSlots[2]}
          fallbackLabel="References"
          className="aspect-[4/5]"
        />
        <LibraryPreviewTile
          item={previewSlots[5]}
          fallbackLabel="Exports"
          className="aspect-[4/3]"
        />
      </div>
    </div>
  );
}
