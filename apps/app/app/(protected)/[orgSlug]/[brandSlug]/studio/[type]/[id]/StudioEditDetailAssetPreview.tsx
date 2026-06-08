'use client';

import { IngredientCategory } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import Image from 'next/image';
import type { RefObject } from 'react';

type StudioEditDetailAssetPreviewProps = {
  selectedIngredient: IIngredient;
  categoryType: IngredientCategory;
  videoRef: RefObject<HTMLVideoElement | null>;
};

export default function StudioEditDetailAssetPreview({
  selectedIngredient,
  categoryType,
  videoRef,
}: StudioEditDetailAssetPreviewProps) {
  if (!selectedIngredient.ingredientUrl) {
    return (
      <div className="aspect-video bg-muted shadow-lg flex items-center justify-center p-16">
        <span className="text-foreground/50 text-lg">No preview available</span>
      </div>
    );
  }

  if (categoryType === IngredientCategory.VIDEO) {
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        <VideoPlayer
          videoRef={videoRef}
          src={selectedIngredient.ingredientUrl}
          thumbnail={selectedIngredient.thumbnailUrl}
          config={{
            autoPlay: false,
            controls: true,
            loop: false,
            muted: false,
            playsInline: true,
            preload: 'metadata',
          }}
        />
      </div>
    );
  }

  if (categoryType === IngredientCategory.IMAGE) {
    return (
      <div className="relative">
        <Image
          src={selectedIngredient.ingredientUrl}
          alt={selectedIngredient.metadataLabel || 'Image'}
          className="max-w-full max-h-sidebar w-auto h-auto object-contain shadow-lg"
          width={selectedIngredient.width || 1920}
          height={selectedIngredient.height || 1080}
          priority
        />
      </div>
    );
  }

  return (
    <div className="aspect-video bg-muted shadow-lg flex items-center justify-center p-16">
      <span className="text-foreground/50 text-lg">No preview available</span>
    </div>
  );
}
