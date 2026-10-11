import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { TurboIdeaStripProps } from '@genfeedai/props/studio/turbo-presets.props';
import type { ReactElement } from 'react';

const MAX_TILES = 6;

const TILE_SHAPE_CLASSES = {
  avatar: 'aspect-square rounded-full',
  image: 'aspect-square rounded-sm',
  video: 'aspect-[9/16] rounded-sm',
} as const;

const TILE_TONE_CLASSES = [
  'bg-primary/20',
  'bg-primary/10',
  'bg-tertiary',
] as const;

/** Decorative row of idea tiles: one shape per format, one tile per idea. */
export default function TurboIdeaStrip({
  count,
  formats,
}: TurboIdeaStripProps): ReactElement {
  const tiles = Array.from(
    { length: Math.min(Math.max(count, 1), MAX_TILES) },
    (_, index) => ({
      format: formats[index % Math.max(formats.length, 1)] ?? 'image',
      id: `tile-${index}`,
      tone: TILE_TONE_CLASSES[index % TILE_TONE_CLASSES.length],
    }),
  );

  return (
    <div
      aria-hidden="true"
      className="flex h-16 items-center gap-1.5 overflow-hidden rounded-md bg-muted/40 px-2"
      data-testid="turbo-idea-strip"
    >
      {tiles.map((tile) => (
        <div
          className={cn(
            'h-12 shrink-0 border border-border',
            TILE_SHAPE_CLASSES[tile.format],
            tile.tone,
          )}
          key={tile.id}
        />
      ))}
    </div>
  );
}
