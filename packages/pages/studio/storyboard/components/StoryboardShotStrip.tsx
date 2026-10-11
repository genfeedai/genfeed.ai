import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { StoryboardShotStripProps } from '@genfeedai/props/studio/storyboard-presets.props';
import type { ReactElement } from 'react';

const FRAME_ASPECT_CLASSES: Record<StoryboardShotStripProps['format'], string> =
  {
    '1:1': 'aspect-square',
    '16:9': 'aspect-video',
    '9:16': 'aspect-[9/16]',
  };

const FRAMES = [
  { id: 'first', tone: 'bg-primary/20' },
  { id: 'second', tone: 'bg-primary/10' },
  { id: 'third', tone: 'bg-tertiary' },
  { id: 'fourth', tone: 'bg-primary/10' },
  { id: 'fifth', tone: 'bg-primary/20' },
];

/** Decorative row of empty frames so a preset card reads as a storyboard. */
export default function StoryboardShotStrip({
  format,
  shotCount,
}: StoryboardShotStripProps): ReactElement {
  const frames = FRAMES.slice(0, Math.max(shotCount, 1));

  return (
    <div
      aria-hidden="true"
      className="flex h-16 items-center gap-1.5 overflow-hidden rounded-md bg-muted/40 px-2"
      data-testid="storyboard-shot-strip"
    >
      {frames.map((frame) => (
        <div
          className={cn(
            'h-12 shrink-0 rounded-sm border border-border',
            FRAME_ASPECT_CLASSES[format],
            frame.tone,
          )}
          key={frame.id}
        />
      ))}
    </div>
  );
}
