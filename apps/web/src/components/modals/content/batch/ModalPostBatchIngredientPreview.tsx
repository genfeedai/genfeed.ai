'use client';

import { formatEnumLabel, IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Badge } from '@ui/primitives/badge';
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

const PREVIEW_MAX_HEIGHT = '12rem';

/**
 * The asset being published, shown compactly at the top of the details step:
 * its media at the right proportions, then its name and type.
 */
export default function ModalPostBatchIngredientPreview({
  ingredient,
  aspectRatioInfo,
}: ModalPostBatchIngredientPreviewProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative flex w-fit items-center justify-center overflow-hidden rounded-md shadow-border"
        style={{
          aspectRatio: `${aspectRatioInfo.width} / ${aspectRatioInfo.height}`,
          maxHeight: PREVIEW_MAX_HEIGHT,
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
            <div className="flex aspect-video w-full items-center justify-center bg-background/70 text-foreground/60">
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
            className="h-auto object-contain outline-media"
            sizes="(max-width: 768px) 100vw, 320px"
            style={{
              aspectRatio: `${aspectRatioInfo.width} / ${aspectRatioInfo.height}`,
              maxHeight: PREVIEW_MAX_HEIGHT,
              width: 'auto',
            }}
          />
        )}
      </div>
      <div className="flex max-w-full flex-col items-center gap-2">
        <h4 className="max-w-full truncate text-sm font-semibold">
          {ingredient.metadataLabel || 'Untitled'}
        </h4>
        <div className="flex flex-wrap justify-center gap-2">
          <Badge>{formatEnumLabel(ingredient.category)}</Badge>
          {ingredient.ingredientFormat && (
            <Badge>{ingredient.ingredientFormat}</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
