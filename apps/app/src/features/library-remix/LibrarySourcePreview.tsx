'use client';

import { IngredientCategory } from '@genfeedai/enums';
import type { IAsset, IIngredient } from '@genfeedai/interfaces';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import Image from 'next/image';
import { HiOutlinePhoto } from 'react-icons/hi2';
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
  if (isIngredient(record)) {
    return (
      record.metadataLabel || `${record.category} ${record.id.slice(0, 8)}`
    );
  }

  return `${record.category} ${record.id.slice(0, 8)}`;
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
          className="bg-black"
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
          unoptimized={ingredient?.category === IngredientCategory.GIF}
        />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <HiOutlinePhoto aria-hidden="true" className="size-7" />
          <span className="sr-only">Preview unavailable</span>
        </div>
      )}
    </div>
  );
}
