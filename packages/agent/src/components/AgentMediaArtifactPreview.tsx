'use client';

import { Metadata } from '@genfeedai/models/content/metadata.model';
import { Image as IngredientImage } from '@genfeedai/models/ingredients/image.model';
import { Video } from '@genfeedai/models/ingredients/video.model';
import type { AgentMediaArtifactPreviewProps } from '@genfeedai/props/ui/agent/agent-media-artifact-preview.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import AudioPreviewPlayer from '@ui/audio/preview-player/AudioPreviewPlayer';
import MediaLightbox from '@ui/layouts/lightbox/MediaLightbox';
import {
  LazyMasonryImage,
  LazyMasonryVideo,
} from '@ui/lazy/masonry/LazyMasonry';
import { type ReactElement, useMemo, useState } from 'react';

export type {
  AgentMediaArtifact,
  AgentMediaArtifactKind,
} from '@genfeedai/props/ui/agent/agent-media-artifact-preview.props';

export function AgentMediaArtifactPreview({
  assets,
  className,
  displayMode = 'grid',
  title = 'Generated assets',
}: AgentMediaArtifactPreviewProps): ReactElement | null {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const visibleAssets = useMemo(
    () => assets.filter((asset) => asset.url.trim()),
    [assets],
  );
  const mediaItems = useMemo(
    () =>
      visibleAssets.flatMap((asset, index) => {
        if (asset.kind === 'audio') return [];
        const ingredient = {
          cdnUrl: asset.url,
          prompt:
            asset.alt?.trim() || asset.title?.trim() || `${title} ${index + 1}`,
          id: asset.url,
          metadata: new Metadata({
            label:
              asset.title?.trim() ||
              asset.alt?.trim() ||
              `${title} ${index + 1}`,
          }),
        };
        return [
          asset.kind === 'image'
            ? new IngredientImage(ingredient)
            : new Video(ingredient),
        ];
      }),
    [visibleAssets, title],
  );

  if (visibleAssets.length === 0) return null;

  return (
    <div className={className}>
      <div
        className={cn(
          'grid gap-2',
          displayMode === 'grid' && visibleAssets.length === 1 && 'max-w-sm',
          displayMode === 'featured' || visibleAssets.length === 1
            ? 'grid-cols-1'
            : 'grid-cols-2 sm:grid-cols-3',
        )}
      >
        {visibleAssets.map((asset, index) => {
          const label = asset.title?.trim() || `${title} ${index + 1}`;
          if (asset.kind === 'audio') {
            return (
              <AudioPreviewPlayer
                key={`${asset.kind}-${asset.url}-${index}`}
                audioUrl={asset.url}
                label={label}
              />
            );
          }
          const mediaIndex = visibleAssets
            .slice(0, index)
            .filter((item) => item.kind !== 'audio').length;
          const ingredient = mediaItems[mediaIndex];
          const sharedProps = {
            isActionsEnabled: false,
            isContainerHovered: true,
            isDragEnabled: false,
            onClickIngredient: () => setActiveIndex(mediaIndex),
          };
          return (
            <div
              key={`${asset.kind}-${asset.url}-${index}`}
              className="group relative min-w-0"
            >
              {asset.kind === 'image' ? (
                <LazyMasonryImage {...sharedProps} image={ingredient} />
              ) : (
                <LazyMasonryVideo {...sharedProps} video={ingredient} />
              )}
            </div>
          );
        })}
      </div>
      {activeIndex !== null && mediaItems.length > 0 && (
        <MediaLightbox
          items={mediaItems}
          startIndex={Math.min(activeIndex, mediaItems.length - 1)}
          open
          onClose={() => setActiveIndex(null)}
        />
      )}
    </div>
  );
}
