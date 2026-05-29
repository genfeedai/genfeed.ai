'use client';

import { ButtonVariant, IngredientCategory } from '@genfeedai/enums';
import type { IActivity } from '@genfeedai/interfaces';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { HiEye, HiFilm, HiPlay } from 'react-icons/hi2';

type Props = {
  activity: IActivity;
  isBackgroundTask: boolean;
  status: 'processing' | 'completed' | 'failed' | 'pending';
  resultType: IngredientCategory | undefined;
  parsedMediaUrl: string | undefined;
  resultId: string | undefined;
  getPreviewUrl: (
    ingredient: Record<string, unknown>,
    category: IngredientCategory,
  ) => string | undefined;
  onViewIngredient: (ingredient: unknown) => void;
};

export default function ActivityThumbnailCell({
  activity,
  isBackgroundTask,
  status,
  resultType,
  parsedMediaUrl,
  resultId,
  getPreviewUrl,
  onViewIngredient,
}: Props) {
  const a = activity;

  if (isBackgroundTask) {
    if (resultId && status === 'completed') {
      const ingredient = (a as unknown as Record<string, unknown>).ingredient;
      if (ingredient && resultType) {
        const previewUrl = getPreviewUrl(
          ingredient as Record<string, unknown>,
          resultType,
        );
        if (previewUrl) {
          return (
            <div className="group relative size-10 shrink-0 overflow-hidden bg-background">
              <Image
                src={previewUrl}
                alt={a.label || 'Activity asset'}
                fill
                className="object-cover"
                sizes="48px"
                unoptimized
              />
              {resultType === IngredientCategory.VIDEO && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/50 transition-colors">
                  <HiPlay className="size-4 text-white group-hover:hidden" />
                  <HiEye className="size-5 text-white hidden group-hover:block" />
                </div>
              )}
              {resultType !== IngredientCategory.VIDEO && (
                <Button
                  withWrapper={false}
                  variant={ButtonVariant.UNSTYLED}
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewIngredient(ingredient);
                  }}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <HiEye className="size-5 text-white" />
                </Button>
              )}
              {resultType === IngredientCategory.VIDEO && (
                <Button
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewIngredient(ingredient);
                  }}
                  className="absolute inset-0"
                />
              )}
            </div>
          );
        }
      }
    }

    if (parsedMediaUrl && status === 'completed') {
      return (
        <div className="relative size-10 shrink-0 overflow-hidden bg-background">
          <Image
            src={parsedMediaUrl}
            alt={a.label || 'Activity asset'}
            fill
            className="object-cover"
            sizes="48px"
            unoptimized
          />
        </div>
      );
    }
  } else {
    let assetInfo: { type?: string; url?: string } | null = null;
    try {
      if (a.value?.startsWith('{')) {
        assetInfo = JSON.parse(a.value);
      }
    } catch {
      if (
        a.value &&
        (a.value.includes('/images/') || a.value.includes('/videos/'))
      ) {
        const isVideo = a.value.includes('/videos/');
        assetInfo = {
          type: isVideo ? 'video' : 'image',
          url: a.value,
        };
      }
    }

    if (assetInfo?.url) {
      return (
        <div className="relative size-10 shrink-0 overflow-hidden bg-background">
          <Image
            src={assetInfo.url}
            alt="Generated asset"
            fill
            className="object-cover"
            sizes="48px"
            unoptimized
          />
          {assetInfo.type === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <HiPlay className="size-4 text-white" />
            </div>
          )}
        </div>
      );
    }
  }

  return (
    <div className="size-8 shrink-0 bg-background flex items-center justify-center">
      <HiFilm className="size-4 text-foreground/40" />
    </div>
  );
}
