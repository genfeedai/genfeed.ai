'use client';

import { cn } from '@genfeedai/helpers';
import { useAnimation } from 'motion/react';
import { forwardRef, type ReactNode, useImperativeHandle } from 'react';
import type {
  AnimatedIconHandle,
  AnimatedIconProps,
} from './animated-icon.types';

export type AnimatedIconControls = ReturnType<typeof useAnimation>;

/**
 * For icons lucide-animated does not have: the same contract as a registry
 * icon (`startAnimation` / `stopAnimation`, `size`, div props), drawn on
 * Lucide's own geometry so the swap on hover never changes the glyph.
 * The host drives it (see `useHoverAnimatedIcon`); it has no hover of its own.
 */
export function createAnimatedIcon(
  displayName: string,
  draw: (controls: AnimatedIconControls) => ReactNode,
) {
  const AnimatedIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
    ({ className, size = 28, ...props }, ref) => {
      const controls = useAnimation();

      useImperativeHandle(ref, () => ({
        startAnimation: () => {
          void controls.start('animate');
        },
        stopAnimation: () => {
          void controls.start('normal');
        },
      }));

      return (
        <div className={cn('inline-flex shrink-0', className)} {...props}>
          <svg
            aria-hidden="true"
            className="size-full overflow-visible"
            fill="none"
            height={size}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width={size}
            xmlns="http://www.w3.org/2000/svg"
          >
            {draw(controls)}
          </svg>
        </div>
      );
    },
  );
  AnimatedIcon.displayName = displayName;
  return AnimatedIcon;
}
