'use client';

import { cn } from '@genfeedai/helpers';
import type {
  AnimatedIconHandle,
  AnimatedIconProps,
} from '@ui/primitives/animated-icons/animated-icon.types';
import { useAnimatedIconControls } from '@ui/primitives/animated-icons/use-animated-icon-controls';
import type { Variants } from 'motion/react';
import { motion } from 'motion/react';
import { forwardRef } from 'react';

const PATH_VARIANTS: Variants = {
  normal: {
    opacity: 1,
    pathLength: 1,
    pathOffset: 0,
    transition: {
      duration: 0.4,
      opacity: { duration: 0.1 },
    },
  },
  animate: {
    opacity: [0, 1],
    pathLength: [0, 1],
    pathOffset: [1, 0],
    transition: {
      duration: 0.6,
      ease: 'linear',
      opacity: { duration: 0.1 },
    },
  },
};

const SQUARE_VARIANTS: Variants = {
  normal: {
    transition: {
      duration: 0.4,
    },
  },
  animate: {
    transition: {
      duration: 0.6,
      ease: 'easeInOut',
    },
  },
};

const SquareActivityIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
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
          <motion.rect
            animate={controls}
            height="18"
            initial="normal"
            rx="2"
            variants={SQUARE_VARIANTS}
            width="18"
            x="3"
            y="3"
          />
          <motion.path
            animate={controls}
            d="M17 12h-2l-2 5-2-10-2 5H7"
            initial="normal"
            variants={PATH_VARIANTS}
          />
        </svg>
      </div>
    );
  },
);

SquareActivityIcon.displayName = 'SquareActivityIcon';

export { SquareActivityIcon };
