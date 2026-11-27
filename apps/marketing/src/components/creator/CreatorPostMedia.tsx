'use client';

import {
  postMediaRenditionPath,
  postMediaSrcSet,
} from '@data/post-media-rendition';
import type { CreatorPostMediaProps } from '@props/content/creator.props';
import {
  Carousel,
  CarouselContent,
  CarouselCounter,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@ui/primitives/carousel';

/**
 * A post's media on its own page: one item full width, several as a
 * swipeable carousel. Videos play inline with their controls.
 */
export default function CreatorPostMedia({
  alt,
  media,
  rendition,
}: CreatorPostMediaProps): React.ReactElement | null {
  if (media.length === 0) {
    return null;
  }

  const slides = media.map((item, index) => (
    <div
      className="overflow-hidden rounded-lg border border-border bg-foreground/5"
      key={item.id}
    >
      {item.kind === 'video' ? (
        <video
          aria-label={`${alt} (video ${index + 1})`}
          className="h-auto w-full"
          controls
          playsInline
          preload="metadata"
          src={item.url}
        >
          <track kind="captions" />
        </video>
      ) : (
        // biome-ignore lint/performance/noImgElement: media URLs are signed per request, so next/image cannot cache them.
        <img
          alt={media.length === 1 ? alt : `${alt} (${index + 1})`}
          className="h-auto w-full"
          height={item.height}
          loading={index === 0 ? 'eager' : 'lazy'}
          sizes={rendition ? '(min-width: 672px) 640px, 100vw' : undefined}
          src={
            rendition
              ? postMediaRenditionPath(
                  rendition.handle,
                  rendition.postId,
                  item.id,
                  1280,
                )
              : item.url
          }
          srcSet={
            rendition
              ? postMediaSrcSet(rendition.handle, rendition.postId, item.id)
              : undefined
          }
          width={item.width}
        />
      )}
    </div>
  ));

  if (slides.length === 1) {
    return <div>{slides[0]}</div>;
  }

  return (
    <Carousel label="Media" opts={{ align: 'start' }}>
      <CarouselContent className="items-center">
        {slides.map((slide, index) => (
          <CarouselItem key={media[index]?.id}>{slide}</CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious label="Previous slide" />
      <CarouselNext label="Next slide" />
      <CarouselCounter className="absolute right-3 top-3" />
    </Carousel>
  );
}
