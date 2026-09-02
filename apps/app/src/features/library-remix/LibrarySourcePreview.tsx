'use client';

import { formatEnumLabel, IngredientCategory } from '@genfeedai/contracts';
import type { IAsset, IIngredient } from '@genfeedai/contracts/interfaces';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { ImageIcon } from 'lucide-react';
import Image from 'next/image';

import type { LibraryArtifactReference } from './library-remix-reference';

type LibrarySourcePreviewProps = {
  readonly className?: string;
  readonly record: IAsset | IIngredient;
  readonly reference?: LibraryArtifactReference;
};

function isIngredient(record: IAsset | IIngredient): record is IIngredient {
  return 'ingredientUrl' in record || 'scope' in record;
}

export function getLibrarySourceLabel(record: IAsset | IIngredient): string {
  // Ingredient and asset categories are persisted SCREAMING_SNAKE — never show them raw.
  const categoryLabel = formatEnumLabel(record.category) ?? 'Asset';

  if (isIngredient(record)) {
    return record.metadataLabel || `${categoryLabel} ${record.id.slice(0, 8)}`;
  }

  return `${categoryLabel} ${record.id.slice(0, 8)}`;
}

export default function LibrarySourcePreview({
  className = '',
  record,
  reference,
}: LibrarySourcePreviewProps) {
  const ingredient = isIngredient(record) ? record : null;
  const sourceUrl = isIngredient(record) ? record.ingredientUrl : record.url;
  const isVideo = isIngredient(record)
    ? record.category === IngredientCategory.VIDEO
    : record.mimeType?.startsWith('video/') === true;
  const label = getLibrarySourceLabel(record);

  return (
    <div
      className={`relative aspect-[4/3] min-h-0 overflow-hidden bg-background-secondary ${className}`}
      data-library-record-id={record.id}
      data-library-reference={
        reference ? `${reference.kind}:${reference.recordId}` : undefined
      }
    >
      {sourceUrl && isVideo ? (
        <VideoPlayer
          className={'bg-black' /* design-system-allow-content-color */}
          src={sourceUrl}
          thumbnail={ingredient?.thumbnailUrl}
          config={{
            autoPlay: false,
            controls: false,
            loop: false,
            muted: true,
            playsInline: true,
            preload: 'metadata',
          }}
        />
      ) : sourceUrl ? (
        <Image
          alt={label}
          className="object-cover"
          fill
          loading="lazy"
          sizes="(max-width: 768px) 45vw, 12rem"
          src={sourceUrl}
          unoptimized={
            ingredient?.category === IngredientCategory.GIF ||
            !canOptimizeImageSource(sourceUrl)
          }
        />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <ImageIcon aria-hidden="true" className="size-7" />
          <span className="sr-only">Preview unavailable</span>
        </div>
      )}
    </div>
  );
}
