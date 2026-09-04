'use client';

import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import Image from 'next/image';
import { useMemo, useState } from 'react';

const DEFAULT_WORKFLOW_CARD_IMAGE = metadata.cards.default;

function isVideoUrl(url: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
  const lowerUrl = url.toLowerCase();
  return videoExtensions.some((ext) => lowerUrl.includes(ext));
}

type WorkflowCardPreviewProps = {
  name: string;
  thumbnail?: string | null;
};

export default function WorkflowCardPreview({
  name,
  thumbnail,
}: WorkflowCardPreviewProps) {
  const [hasAssetError, setHasAssetError] = useState(false);
  const previewUrl = useMemo(() => {
    if (!thumbnail || hasAssetError) {
      return DEFAULT_WORKFLOW_CARD_IMAGE;
    }
    return thumbnail;
  }, [hasAssetError, thumbnail]);

  const isVideoPreview =
    previewUrl !== DEFAULT_WORKFLOW_CARD_IMAGE && isVideoUrl(previewUrl);

  return (
    <div className="relative aspect-video overflow-hidden rounded shadow-border bg-tertiary">
      {isVideoPreview ? (
        <video
          aria-label="Workflow preview"
          src={previewUrl}
          className="h-full w-full object-cover object-center"
          autoPlay
          muted
          loop
          playsInline
          onError={() => setHasAssetError(true)}
        />
      ) : (
        <Image
          unoptimized={!canOptimizeImageSource(previewUrl)}
          src={previewUrl}
          alt={
            previewUrl === DEFAULT_WORKFLOW_CARD_IMAGE
              ? 'Default workflow card'
              : `${name} thumbnail`
          }
          className="h-full w-full object-cover object-center outline-media"
          onError={() => setHasAssetError(true)}
          sizes="(min-width: 1280px) 30vw, (min-width: 768px) 45vw, 100vw"
          width={800}
          height={600}
        />
      )}
    </div>
  );
}
