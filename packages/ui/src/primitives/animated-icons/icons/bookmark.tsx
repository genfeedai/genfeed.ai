'use client';

import { cn } from '@genfeedai/helpers';
import { useAnimatedIconControls } from '@ui/primitives/animated-icons/use-animated-icon-controls';
import type { Variants } from 'motion/react';
import { motion } from 'motion/react';
import type { HTMLAttributes } from 'react';
import { forwardRef } from 'react';

export interface BookmarkIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface BookmarkIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const BOOKMARK_VARIANTS: Variants = {
  normal: { scaleY: 1, scaleX: 1 },
  animate: {
    scaleY: [1, 1.3, 0.9, 1.05, 1],
    scaleX: [1, 0.9, 1.1, 0.95, 1],
    transition: {
      duration: 0.6,
      ease: 'easeOut',
    },
  },
};

const BookmarkIcon = forwardRef<BookmarkIconHandle, BookmarkIconProps>(
  ({ className, size = 28, onMouseEnter, onMouseLeave, ...props }, ref) => {
    const { controls, handleMouseEnter, handleMouseLeave } =
      useAnimatedIconControls(ref, { onMouseEnter, onMouseLeave });

    return (
      <div
        className={cn('inline-flex shrink-0', className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          className="size-full"
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
          <motion.path
            animate={controls}
            d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"
            style={{ originY: 0.5, originX: 0.5 }}
            variants={BOOKMARK_VARIANTS}
          />
        </svg>
      </div>
    );
  },
);

BookmarkIcon.displayName = 'BookmarkIcon';

export { BookmarkIcon };
