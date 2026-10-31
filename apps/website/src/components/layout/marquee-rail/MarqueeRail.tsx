'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { MarqueeRailProps } from '@genfeedai/props/ui/ui.props';
import { Children, useEffect, useRef, useState } from 'react';

/**
 * Drift speed, in CSS pixels per second. Slow enough to read as a camera move
 * rather than a slideshow: someone looking at one card should be able to finish
 * looking at it before it leaves.
 */
const DRIFT_PIXELS_PER_SECOND = 24;

/**
 * A row of content that moves on its own, forever, in one direction.
 *
 * This is a marquee, not a carousel: no scrollbar, no arrows, nothing to
 * operate, and no end to reach. It is built on a CSS animation rather than a
 * scroll position or a per-frame transform — the compositor runs it without
 * touching the main thread, the browser suspends it when the tab is hidden, and
 * `prefers-reduced-motion` switches it off in CSS instead of in a branch.
 *
 * Seamlessness costs one duplicate of the children. The track holds the set
 * twice and the animation translates by exactly half the track, so the moment
 * the first copy leaves is the moment the second is in its place and the
 * restart is invisible. The duplicate is decorative — hidden from assistive
 * technology and out of the tab order, so the content is announced once.
 *
 * The only JavaScript is a measurement: duration is derived from the real
 * content width so that speed stays constant no matter how many items there
 * are, or how wide they render.
 *
 * The gap lives *inside* each copy, as its spacing plus a trailing pad, rather
 * than between the two. Put it between them and half the track is one copy plus
 * half a gap — the restart lands a few pixels off the item it is supposed to be
 * replacing, and the seam ticks once per cycle.
 */
export default function MarqueeRail({
  children,
  className,
  gapPx = 16,
}: MarqueeRailProps): React.ReactElement {
  const trackRef = useRef<HTMLDivElement>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const items = Children.toArray(children);
  const copyStyle: React.CSSProperties = {
    gap: `${gapPx}px`,
    paddingRight: `${gapPx}px`,
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const measure = () => {
      // Half the track is one full copy of the children — the distance the
      // animation actually travels before it restarts.
      const cycle = track.scrollWidth / 2;
      if (cycle > 0) setDurationSeconds(cycle / DRIFT_PIXELS_PER_SECOND);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(track);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={cn(
        // Reduced motion leaves the row still, so it has to stay reachable some
        // other way — scrolling is that way, and only then.
        'overflow-hidden motion-reduce:overflow-x-auto motion-reduce:scrollbar-hide',
        className,
      )}
    >
      <div
        className={cn(
          'flex w-max',
          // Nothing moves until the width is known: animating a placeholder
          // duration first would visibly change speed on the second frame.
          durationSeconds > 0 && 'animate-marquee-rail',
        )}
        ref={trackRef}
        style={
          durationSeconds > 0
            ? ({
                '--marquee-duration': `${durationSeconds}s`,
              } as React.CSSProperties)
            : undefined
        }
      >
        <div className="flex" style={copyStyle}>
          {items}
        </div>
        <div
          aria-hidden="true"
          className="flex"
          // The copy exists to fill the gap the original leaves behind. Same
          // content, so it must not be announced or focusable twice.
          inert
          style={copyStyle}
        >
          {items}
        </div>
      </div>
    </div>
  );
}
