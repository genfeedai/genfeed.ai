'use client';

import type { CreatorPostCoverProps } from '@props/content/creator.props';
import {
  Carousel,
  CarouselContent,
  CarouselCounter,
  CarouselItem,
} from '@ui/primitives/carousel';

/**
 * The images a post card leads with. A carousel post swipes through its
 * slides in place, and a tap that is not a swipe still opens the post.
 */
export default function CreatorPostCover({
  images,
}: CreatorPostCoverProps): React.ReactElement | null {
  if (images.length === 0) {
    return null;
  }

  if (images.length === 1) {
    return (
      // biome-ignore lint/performance/noImgElement: media URLs are signed per request, so next/image cannot cache them.
      <img
        alt=""
        className="mb-3 aspect-video w-full rounded-md object-cover"
        loading="lazy"
        src={images[0]?.url}
      />
    );
  }

  return (
    <Carousel className="mb-3" label="Post images">
      <CarouselContent>
        {images.map((image) => (
          <CarouselItem key={image.id}>
            {/* biome-ignore lint/performance/noImgElement: media URLs are signed per request, so next/image cannot cache them. */}
            <img
              alt=""
              className="aspect-video w-full rounded-md object-cover"
              draggable={false}
              loading="lazy"
              src={image.url}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselCounter className="absolute right-2 top-2" />
    </Carousel>
  );
}
