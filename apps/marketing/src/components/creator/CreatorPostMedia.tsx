import type { CreatorPostMediaProps } from '@props/content/creator.props';

/**
 * A post's media on its own page: one item full width, several in a two
 * column grid. Videos play inline with their controls.
 */
export default function CreatorPostMedia({
  alt,
  media,
}: CreatorPostMediaProps): React.ReactElement | null {
  if (media.length === 0) {
    return null;
  }

  return (
    <ul
      aria-label="Media"
      className={
        media.length === 1 ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-2'
      }
    >
      {media.map((item, index) => (
        <li
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
              src={item.url}
              width={item.width}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
