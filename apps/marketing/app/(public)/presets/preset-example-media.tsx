import type { PresetExample } from '@genfeedai/contracts/interfaces/elements/preset-example.interface';
import { Play } from 'lucide-react';
import Image from 'next/image';

/** `9:16` as a CSS `aspect-ratio` value. */
export function cssAspectRatio(aspectRatio: string): string {
  return aspectRatio.replace(':', ' / ');
}

const PICTURE_WIDTH = 720;

function pictureHeight(aspectRatio: string): number {
  const [width, height] = aspectRatio.split(':').map(Number);
  return Math.round((PICTURE_WIDTH * (height || 1)) / (width || 1));
}

/**
 * One real run of a preset: a clip with its poster, or a picture. A photo edit
 * shows the picture it started from beside the result.
 */
export default function PresetExampleMedia({
  example,
  isPriority = false,
}: {
  example: PresetExample;
  isPriority?: boolean;
}): React.ReactElement {
  const style = { aspectRatio: cssAspectRatio(example.aspectRatio) };

  if (example.mediaType === 'video') {
    return (
      <video
        aria-label={example.alt}
        className="w-full bg-card object-cover"
        controls
        loop
        muted
        playsInline
        poster={example.posterUrl}
        preload="none"
        src={example.url}
        style={style}
      />
    );
  }

  const picture = (url: string, alt: string) => (
    <Image
      alt={alt}
      className="w-full bg-card object-cover"
      height={pictureHeight(example.aspectRatio)}
      priority={isPriority}
      src={url}
      style={style}
      unoptimized
      width={PICTURE_WIDTH}
    />
  );

  if (example.sourceUrl) {
    return (
      <div className="grid grid-cols-2 gap-px bg-foreground/10">
        <figure>
          {picture(example.sourceUrl, 'The photo before the preset')}
          <figcaption className="bg-card px-3 py-2 text-xs text-foreground/60">
            Before
          </figcaption>
        </figure>
        <figure>
          {picture(example.url, example.alt)}
          <figcaption className="bg-card px-3 py-2 text-xs text-foreground/60">
            After
          </figcaption>
        </figure>
      </div>
    );
  }

  return picture(example.url, example.alt);
}

/** The still that stands in for an example on a card: a clip's poster, or the picture. */
export function PresetCardPicture({
  example,
  label,
}: {
  example: PresetExample;
  label: string;
}): React.ReactElement {
  const isVideo = example.mediaType === 'video';
  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-card">
      <Image
        alt={`${label} example: ${example.alt}`}
        className="absolute inset-0 size-full object-cover"
        height={900}
        src={isVideo ? (example.posterUrl ?? example.url) : example.url}
        unoptimized
        width={720}
      />
      {isVideo ? (
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur-sm"
        >
          <Play className="size-4 fill-current" />
        </span>
      ) : null}
    </div>
  );
}
