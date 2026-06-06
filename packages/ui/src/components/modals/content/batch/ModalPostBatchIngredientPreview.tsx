'use client';

import { ComponentSize, IngredientCategory } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IIngredient } from '@genfeedai/interfaces';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import Badge from '@ui/display/badge/Badge';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import Image from 'next/image';

type AspectRatioInfo = {
  width: number;
  height: number;
  isPortrait: boolean;
};

type ModalPostBatchIngredientPreviewProps = {
  ingredient: IIngredient;
  aspectRatioInfo: AspectRatioInfo;
};

export default function ModalPostBatchIngredientPreview({
  ingredient,
  aspectRatioInfo,
}: ModalPostBatchIngredientPreviewProps) {
  return (
    <div className="w-1/3 flex-shrink-0 max-h-full overflow-y-auto pr-2">
      <div className="sticky top-0 space-y-3">
        <div
          className={cn(
            'relative overflow-hidden shadow-lg flex items-center justify-center mx-auto w-fit',
            // Smart width constraints based on aspect ratio
            aspectRatioInfo.isPortrait ? 'max-w-2xl' : 'max-w-4xl',
          )}
          style={{
            aspectRatio: `${aspectRatioInfo.width} / ${aspectRatioInfo.height}`,
            maxHeight: '60vh',
          }}
        >
          {ingredient.category === IngredientCategory.VIDEO ? (
            ingredient.ingredientUrl ? (
              <VideoPlayer
                src={ingredient.ingredientUrl}
                thumbnail={ingredient?.thumbnailUrl ?? undefined}
                config={{
                  autoPlay: false,
                  controls: true,
                  loop: false,
                  muted: true,
                  playsInline: true,
                  preload: 'metadata',
                }}
              />
            ) : (
              <div className="aspect-video w-full bg-background/70 flex items-center justify-center text-foreground/60">
                Video preview unavailable.
              </div>
            )
          ) : (
            <Image
              src={
                ingredient.ingredientUrl ||
                `${EnvironmentService.assetsEndpoint}/placeholders/portrait.jpg`
              }
              alt={ingredient.metadataLabel || 'Ingredient'}
              width={aspectRatioInfo.width}
              height={aspectRatioInfo.height}
              className="h-auto object-contain"
              sizes="(max-width: 768px) 100vw, 33vw"
              style={{
                aspectRatio: `${aspectRatioInfo.width} / ${aspectRatioInfo.height}`,
                maxHeight: '60vh',
                width: 'auto',
              }}
            />
          )}
        </div>
        <div className="space-y-2">
          <h4 className="font-semibold text-sm truncate max-w-full">
            {ingredient.metadataLabel || 'Untitled'}
          </h4>

          {ingredient.metadataDescription && (
            <p className="text-xs text-foreground/70 line-clamp-2">
              {ingredient.metadataDescription}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Badge size={ComponentSize.SM}>{ingredient.category}</Badge>
            {ingredient.ingredientFormat && (
              <Badge size={ComponentSize.SM}>
                {ingredient.ingredientFormat}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
