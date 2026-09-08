'use client';

import type { WorkflowCardPreviewProps } from '@genfeedai/props/workflows/workflow-card-preview.props';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import Image from 'next/image';
import { useState } from 'react';
import WorkflowGraphPreview from './WorkflowGraphPreview';

function isVideoUrl(url: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
  const lowerUrl = url.toLowerCase();
  return videoExtensions.some((ext) => lowerUrl.includes(ext));
}

export default function WorkflowCardPreview({
  name,
  thumbnail,
  nodes,
  edges,
}: WorkflowCardPreviewProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const previewUrl = thumbnail && thumbnail !== failedUrl ? thumbnail : null;
  const isVideoPreview = previewUrl ? isVideoUrl(previewUrl) : false;

  return (
    <div className="relative aspect-video overflow-hidden rounded shadow-border bg-tertiary">
      {!previewUrl ? (
        <WorkflowGraphPreview name={name} nodes={nodes} edges={edges} />
      ) : isVideoPreview ? (
        <VideoPlayer
          ariaLabel={`${name} workflow preview`}
          src={previewUrl}
          className="h-full w-full"
          mediaClassName="object-cover"
          config={{
            preload: 'metadata',
            autoPlay: false,
            muted: true,
            loop: false,
            playsInline: true,
            controls: false,
          }}
          mediaProps={{ onError: () => setFailedUrl(previewUrl) }}
        />
      ) : (
        <Image
          unoptimized={!canOptimizeImageSource(previewUrl)}
          src={previewUrl}
          alt={`${name} thumbnail`}
          className="h-full w-full object-cover object-center outline-media"
          onError={() => setFailedUrl(previewUrl)}
          sizes="(min-width: 1280px) 30vw, (min-width: 768px) 45vw, 100vw"
          width={800}
          height={600}
        />
      )}
    </div>
  );
}
