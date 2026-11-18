'use client';

import type { ArticleCompareSliderProps } from '@props/content/public-article.props';
import { Badge } from '@ui/primitives/badge';
import { focusRingInsetClassName } from '@ui/primitives/focus-ring';
import { ChevronsLeftRight } from 'lucide-react';
import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';

const INITIAL_POSITION = 50;
const KEY_STEP = 5;
const KEY_STEP_LARGE = 10;
const DEFAULT_ASPECT_RATIO = '16 / 9';

function clampPosition(position: number): number {
  return Math.min(100, Math.max(0, position));
}

function describePosition(position: number): string {
  const rounded = Math.round(position);
  if (rounded <= 2) {
    return 'Showing after';
  }
  if (rounded >= 98) {
    return 'Showing before';
  }
  return `Showing ${rounded}% before`;
}

/**
 * A before/after comparison: the "after" image fills the frame and the
 * "before" image is revealed from the left up to the handle. Dragging, tapping
 * and the arrow keys all move the handle; Home and End jump to either side.
 *
 * The page is sanitized HTML with no scripts, so the author only marks a
 * figure of two images and this component supplies every control.
 */
export default function ArticleCompareSlider({
  compare,
}: ArticleCompareSliderProps): React.ReactElement {
  const frameRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(INITIAL_POSITION);
  const [isDragging, setIsDragging] = useState(false);
  const aspectRatio =
    compare.width && compare.height
      ? `${compare.width} / ${compare.height}`
      : DEFAULT_ASPECT_RATIO;

  const moveTo = (clientX: number): void => {
    const bounds = frameRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0) {
      return;
    }
    setPosition(clampPosition(((clientX - bounds.left) / bounds.width) * 100));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    moveTo(event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (isDragging) {
      moveTo(event.clientX);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        setPosition((current) => clampPosition(current - step));
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        setPosition((current) => clampPosition(current + step));
        break;
      case 'Home':
        setPosition(0);
        break;
      case 'End':
        setPosition(100);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <figure className="not-prose my-10">
      {/* biome-ignore lint/a11y/useSemanticElements: a two-image comparison has no native control; a range input cannot overlay the images. */}
      <div
        aria-label="Compare before and after"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(position)}
        aria-valuetext={describePosition(position)}
        className={`relative cursor-ew-resize touch-pan-y select-none overflow-hidden border border-foreground/10 bg-muted ${focusRingInsetClassName}`}
        onKeyDown={handleKeyDown}
        onPointerCancel={() => setIsDragging(false)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => setIsDragging(false)}
        ref={frameRef}
        role="slider"
        style={{ aspectRatio }}
        tabIndex={0}
      >
        {/* biome-ignore lint/performance/noImgElement: article images are served from signed URLs that next/image cannot optimize. */}
        <img
          alt={compare.after.alt}
          className="pointer-events-none size-full object-cover"
          draggable={false}
          loading="lazy"
          src={compare.after.src}
        />
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          {/* biome-ignore lint/performance/noImgElement: article images are served from signed URLs that next/image cannot optimize. */}
          <img
            alt={compare.before.alt}
            className="pointer-events-none size-full object-cover"
            draggable={false}
            loading="lazy"
            src={compare.before.src}
          />
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" // design-system-allow-content-color -- divider over arbitrary image content
          style={{ left: `${position}%` }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${position}%` }}
        >
          <span
            className={`flex size-9 items-center justify-center rounded-full bg-black/50 text-white shadow-md backdrop-blur-sm transition-transform motion-reduce:transition-none ${isDragging ? 'scale-110' : ''}`} // design-system-allow-content-color -- control over arbitrary image content
          >
            <ChevronsLeftRight className="size-4" />
          </span>
        </div>

        <Badge
          className="pointer-events-none absolute left-2 top-2"
          variant="overlay"
        >
          Before
        </Badge>
        <Badge
          className="pointer-events-none absolute right-2 top-2"
          variant="overlay"
        >
          After
        </Badge>
      </div>
      {compare.captionHtml ? (
        <figcaption
          className="mt-3 text-sm text-foreground/60"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: the caption is a slice of the sanitized article body
          dangerouslySetInnerHTML={{ __html: compare.captionHtml }}
        />
      ) : null}
    </figure>
  );
}
