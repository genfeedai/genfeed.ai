'use client';

import { IngredientCategory, MetadataExtension } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useDominantColor } from '@genfeedai/hooks/ui/use-dominant-color/use-dominant-color';
import type { MediaLightboxProps } from '@genfeedai/props/layout/media-lightbox.props';
import {
  LightboxSlide,
  LightboxThumbnail,
} from '@ui/layouts/lightbox/LightboxMedia';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import type { Plugin } from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/plugins/thumbnails.css';
import 'yet-another-react-lightbox/styles.css';

// Local Slide type to avoid ESM/CJS import issues
type Slide = {
  src: string;
  title?: string;
  description?: string;
  [key: string]: unknown;
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
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [activeIndex, setActiveIndex] = useState(startIndex);

  useEffect(() => {
    setActiveIndex(startIndex);
  }, [startIndex]);

  // Tint the viewer backdrop with a heavily-darkened version of the focused
  // slide's dominant colour so the viewer takes on the content's colour while
  // the lightbox chrome stays grayscale.
  const activeItem = items[activeIndex] ?? items[startIndex];
  const dominant = useDominantColor(
    activeItem?.ingredientUrl ?? activeItem?.thumbnailUrl,
  );

  const backdropStyles = useMemo(() => {
    if (!dominant) {
      return {};
    }
    const darken = (channel: number) => Math.round(channel * 0.16);
    return {
      container: {
        backgroundColor: `rgb(${darken(dominant.r)} ${darken(dominant.g)} ${darken(dominant.b)})`,
      },
    };
  }, [dominant]);

  useEffect(() => {
    // Dynamically import ESM plugins on the client side. Abort on unmount so a
    // late resolution cannot setState after teardown (React root races).
    let isCancelled = false;
    import('yet-another-react-lightbox/plugins/thumbnails').then(
      (ThumbnailsModule) => {
        if (isCancelled) {
          return;
        }
        setPlugins([ThumbnailsModule.default]);
      },
    );
    return () => {
      isCancelled = true;
    };
  }, []);

  // One slide per item, so a slide index is always an item index. The media
  // itself is resolved inside each slide, from the item's authorized grant.
  const slides: Slide[] = useMemo(
    () =>
      items.map((item: IIngredient) => {
        const isVideo =
          item.category === IngredientCategory.VIDEO ||
          item.category === IngredientCategory.VIDEO_EDIT ||
          item.metadataExtension === MetadataExtension.MP4 ||
          item.metadataExtension === MetadataExtension.MOV ||
          item.metadataExtension === MetadataExtension.WEBM;

        return {
          alt: item.metadataLabel || 'Media',
          height: item.height || 1920,
          ingredient: item,
          isVideo,
          src: item.ingredientUrl || '',
          type: isVideo ? 'video' : undefined,
          width: item.width || 1080,
        };
      }),
    [items],
  );

  const isReady = plugins.length > 0 && slides.length > 0;
  if (!open || !isReady) {
    return null;
  }

  const safeIndex = Math.min(
    Math.max(0, startIndex),
    Math.max(0, slides.length - 1),
  );

  return (
    <Lightbox
      open
      close={onClose}
      slides={slides}
      index={safeIndex}
      plugins={plugins}
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
      styles={backdropStyles ?? {}}
      on={{
        view: ({ index }) => setActiveIndex(index),
      }}
      render={{
        buttonNext: slides.length <= 1 ? () => null : undefined,
        buttonPrev: slides.length <= 1 ? () => null : undefined,
        slide: ({ slide, offset }) => (
          <LightboxSlide
            ariaLabel="Media lightbox video"
            isActive={offset === 0 && open}
            isVideo={(slide as Slide).isVideo === true}
            item={(slide as Slide).ingredient as IIngredient}
          />
        ),
        thumbnail: ({ slide }) => (
          <LightboxThumbnail
            isVideo={(slide as Slide).isVideo === true}
            item={(slide as Slide).ingredient as IIngredient}
          />
        ),
      }}
    />
  );
}
