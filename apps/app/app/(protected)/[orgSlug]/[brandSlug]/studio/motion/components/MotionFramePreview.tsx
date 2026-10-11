import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { MotionFramePreviewProps } from '@genfeedai/props/studio/motion-presets.props';
import type { ReactElement } from 'react';

const FPS = 30;
const MIN_KEYFRAMES = 2;
const MAX_KEYFRAMES = 6;
const SECONDS_PER_KEYFRAME = 3;

function resolveFrameAspectClass(width: number, height: number): string {
  if (height > width) return 'aspect-[9/16]';
  if (height === width) return 'aspect-square';
  return 'aspect-video';
}

/** Decorative frame plus timeline so a preset reads as a short animation. */
export default function MotionFramePreview({
  durationFrames,
  height,
  width,
}: MotionFramePreviewProps): ReactElement {
  const keyframeCount = Math.min(
    MAX_KEYFRAMES,
    Math.max(
      MIN_KEYFRAMES,
      Math.round(durationFrames / FPS / SECONDS_PER_KEYFRAME),
    ),
  );
  const keyframes = Array.from(
    { length: keyframeCount },
    (_, index) => `keyframe-${index}`,
  );

  return (
    <div
      aria-hidden="true"
      className="flex h-16 items-center gap-3 overflow-hidden rounded-md bg-muted/40 px-2"
      data-testid="motion-frame-preview"
    >
      <div
        className={cn(
          'flex h-12 shrink-0 flex-col justify-end gap-0.5 rounded-sm border border-border bg-primary/10 p-1',
          resolveFrameAspectClass(width, height),
        )}
      >
        <div className="h-1 w-3/4 rounded-full bg-primary/40" />
        <div className="h-1 w-1/2 rounded-full bg-primary/20" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="h-1.5 rounded-full bg-tertiary">
          <div className="h-full w-1/3 rounded-full bg-primary/40" />
        </div>
        <div className="flex justify-between">
          {keyframes.map((id) => (
            <div
              className="size-1.5 rounded-full border border-border bg-primary/20"
              key={id}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
