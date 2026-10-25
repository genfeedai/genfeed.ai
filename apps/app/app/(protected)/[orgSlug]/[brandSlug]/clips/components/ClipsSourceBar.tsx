import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ClipsSourceBarProps } from '@genfeedai/props/studio/clips-presets.props';
import type { ReactElement } from 'react';

const SEGMENT_COUNT = 12;
const MAX_CLIP_FRAMES = 4;

const SEGMENTS = Array.from(
  { length: SEGMENT_COUNT },
  (_, index) => `segment-${index}`,
);
const CLIP_FRAMES = Array.from(
  { length: MAX_CLIP_FRAMES },
  (_, index) => `clip-${index}`,
);

/** Whether the nth source segment holds a highlight, spread evenly. */
function isHighlighted(index: number, clipCount: number): boolean {
  const count = Math.min(Math.max(clipCount, 1), SEGMENT_COUNT);
  return (
    Math.floor(((index + 1) * count) / SEGMENT_COUNT) >
    Math.floor((index * count) / SEGMENT_COUNT)
  );
}

/** Decorative long source with highlighted moments and the clips cut from it. */
export default function ClipsSourceBar({
  clipCount,
}: ClipsSourceBarProps): ReactElement {
  return (
    <div
      aria-hidden="true"
      className="flex h-20 flex-col justify-center gap-2 overflow-hidden rounded-md bg-muted/40 px-2"
      data-testid="clips-source-bar"
    >
      <div className="flex h-2 gap-0.5">
        {SEGMENTS.map((id, index) => (
          <div
            className={cn(
              'flex-1 rounded-sm',
              isHighlighted(index, clipCount) ? 'bg-primary/40' : 'bg-tertiary',
            )}
            key={id}
          />
        ))}
      </div>
      <div className="flex h-10 items-center gap-1.5">
        {CLIP_FRAMES.map((id, index) => (
          <div
            className={cn(
              'aspect-[9/16] h-10 shrink-0 rounded-sm border border-border',
              index % 2 === 0 ? 'bg-primary/20' : 'bg-primary/10',
            )}
            key={id}
          />
        ))}
      </div>
    </div>
  );
}
