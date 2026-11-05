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

const TOP_RECT_VARIANTS: Variants = {
  normal: { y: 0 },
  animate: {
    y: [0, 12, 12, 0],
    transition: {
      duration: 0.9,
      ease: 'easeInOut',
      repeat: 1,
      times: [0, 0.35, 0.65, 1],
    },
  },
};

const BOTTOM_RECT_VARIANTS: Variants = {
  normal: { y: 0 },
  animate: {
    y: [0, -12, -12, 0],
    transition: {
      duration: 0.9,
      ease: 'easeInOut',
      repeat: 1,
      times: [0, 0.35, 0.65, 1],
    },
  },
};

const ServerIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
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
          <motion.g
            animate={controls}
            initial="normal"
            variants={TOP_RECT_VARIANTS}
          >
            <rect height="8" rx="2" ry="2" width="20" x="2" y="2" />
            <line x1="6" x2="10" y1="6" y2="6" />
          </motion.g>
          <motion.g
            animate={controls}
            initial="normal"
            variants={BOTTOM_RECT_VARIANTS}
          >
            <rect height="8" rx="2" ry="2" width="20" x="2" y="14" />
            <line x1="6" x2="10" y1="18" y2="18" />
          </motion.g>
        </svg>
      </div>
    );
  },
);

ServerIcon.displayName = 'ServerIcon';

export { ServerIcon };
