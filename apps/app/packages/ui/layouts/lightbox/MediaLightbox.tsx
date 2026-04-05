'use client';

import type { IIngredient } from '@genfeedai/interfaces';
import { IngredientCategory } from '@genfeedai/enums';
import type { MediaLightboxProps } from '@props/layout/media-lightbox.props';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import 'yet-another-react-lightbox/plugins/captions.css';
import 'yet-another-react-lightbox/plugins/thumbnails.css';
import 'yet-another-react-lightbox/styles.css';

// Local Slide type to avoid ESM/CJS import issues
type Slide = {
  src: string;
  title?: string;
  description?: string;
  [key: string]: unknown;
};

// Custom properties for video slides
type VideoSlideProps = {
  thumbnailSrc?: string;
  type?: 'video';
  sources?: Array<{ src: string; type: string }>;
  controls?: boolean;
  playsInline?: boolean;
  preload?: string;
  poster?: string;
};

// Dynamically import lightbox to avoid SSR issues
const Lightbox = dynamic(() => import('yet-another-react-lightbox'), {
  ssr: false,
});

export default function MediaLightbox({
  items,
  startIndex,
  open,
  onClose,
}: MediaLightboxProps) {
  // Load plugins dynamically on client side
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [plugins, setPlugins] = useState<any[]>([]);

  useEffect(() => {
    // Dynamically import ESM plugins on the client side
    Promise.all([
      import('yet-another-react-lightbox/plugins/video'),
      import('yet-another-react-lightbox/plugins/captions'),
      import('yet-another-react-lightbox/plugins/thumbnails'),
    ]).then(([VideoModule, CaptionsModule, ThumbnailsModule]) => {
      setPlugins([
        VideoModule.default,
        CaptionsModule.default,
        ThumbnailsModule.default,
      ]);
    });
  }, []);

  // Map ingredients to lightbox slides with their thumbnail URLs
  const slides: Slide[] = useMemo(() => {
    return items
      .filter((item: IIngredient) => item.ingredientUrl || item.thumbnailUrl)
      .map((item: IIngredient) => {
        // Detect video types by category or file extension
        const isVideoCategory =
          item.category === IngredientCategory.VIDEO ||
          item.category === IngredientCategory.VIDEO_EDIT;

        const isVideoExtension =
          item.metadataExtension === 'mp4' ||
          item.metadataExtension === 'mov' ||
          item.metadataExtension === 'webm';

        const isVideo = isVideoCategory || isVideoExtension;

        const src = item.ingredientUrl || item.thumbnailUrl || '';

        const slide: Slide & VideoSlideProps = {
          alt: item.metadataLabel || 'Media',
          height: item.height || 1920,
          src,
          width: item.width || 1080,
        } as Slide & VideoSlideProps;

        if (isVideo) {
          // Configure video slide per yet-another-react-lightbox docs
          slide.type = 'video';
          slide.sources = [
            {
              src,
              type: `video/${item.metadataExtension || 'mp4'}`,
            },
          ];
          slide.controls = true;
          slide.playsInline = true;
          slide.preload = 'metadata';

          // Always set poster for video thumbnails (use thumbnailUrl or fallback to src for first frame)
          const posterUrl =
            item.thumbnailUrl && item.thumbnailUrl !== src
              ? item.thumbnailUrl
              : src;

          slide.poster = posterUrl;

          // Store the poster URL as a custom property for thumbnail rendering
          slide.thumbnailSrc = posterUrl;
        }

        // Add title and description for captions plugin
        if (item.metadataLabel) {
          slide.title = item.metadataLabel;
        }

        if (item.promptText) {
          slide.description = item.promptText;
        }

        return slide;
      });
  }, [items]);

  // Don't render if no slides or plugins not loaded
  if (slides.length === 0 || plugins.length === 0) {
    return null;
  }

  return (
    <Lightbox
      open={open}
      close={onClose}
      slides={slides}
      index={startIndex}
      plugins={plugins}
      captions={{
        descriptionMaxLines: 3,
        descriptionTextAlign: 'start',
        showToggle: true,
      }}
      thumbnails={{
        border: 0,
        borderRadius: 4,
        gap: 8,
        height: 80,
        padding: 4,
        width: 120,
      }}
      carousel={{
        finite: true,
      }}
      animation={{
        fade: 300,
      }}
      controller={{
        closeOnBackdropClick: true,
      }}
      render={{
        buttonNext: slides.length <= 1 ? () => null : undefined,
        buttonPrev: slides.length <= 1 ? () => null : undefined,
        // Custom slide render to show poster before video loads
        slide: ({ slide }) => {
          const videoSlide = slide as Slide & VideoSlideProps;
          const isVideo = videoSlide.type === 'video';
          const thumbnailSrc = videoSlide.thumbnailSrc;

          if (isVideo && thumbnailSrc) {
            return (
              <div
                style={{
                  alignItems: 'center',
                  backgroundColor: 'black',
                  display: 'flex',
                  height: '100%',
                  justifyContent: 'center',
                  position: 'relative',
                  width: '100%',
                }}
              >
                <video
                  src={videoSlide.sources?.[0]?.src}
                  poster={thumbnailSrc}
                  controls
                  playsInline
                  preload="none"
                  style={{
                    maxHeight: '100%',
                    maxWidth: '100%',
                    objectFit: 'contain',
                  }}
                  // Force poster to show by not auto-loading
                  autoPlay={false}
                />
              </div>
            );
          }

          // For images and videos without custom handling, use default rendering
          return undefined;
        },
        // Custom thumbnail render for video slides to show poster images
        thumbnail: ({ slide }) => {
          const videoSlide = slide as Slide & VideoSlideProps;
          const thumbnailSrc = videoSlide.thumbnailSrc;
          const isVideo = videoSlide.type === 'video';

          if (isVideo && thumbnailSrc) {
            return (
              <img
                src={thumbnailSrc}
                alt={'Video thumbnail'}
                style={{
                  height: '100%',
                  objectFit: 'cover',
                  width: '100%',
                }}
              />
            );
          }

          // For images, use default rendering
          return undefined;
        },
      }}
    />
  );
}
