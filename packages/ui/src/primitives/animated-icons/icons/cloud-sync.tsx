'use client';

import { cn } from '@genfeedai/helpers';
import type {
  AnimatedIconHandle,
  AnimatedIconProps,
} from '@ui/primitives/animated-icons/animated-icon.types';
import { useAnimatedIconControls } from '@ui/primitives/animated-icons/use-animated-icon-controls';
import { motion, type Transition, type Variants } from 'motion/react';
import { forwardRef } from 'react';

const SYNC_VARIANTS: Variants = {
  normal: { rotate: 0 },
  animate: {
    rotate: -360,
  },
};

const SYNC_TRANSITION: Transition = {
  duration: 1.2,
  ease: 'easeInOut',
};

const CloudSyncIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
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
          <path d="M20.996 15.251A4.5 4.5 0 0 0 17.495 8h-1.79a7 7 0 1 0-12.709 5.607" />
          <motion.g
            animate={controls}
            initial="normal"
            transition={SYNC_TRANSITION}
            variants={SYNC_VARIANTS}
          >
            <path d="m17 18-1.535 1.605a5 5 0 0 1-8-1.5" />
            <path d="M17 22v-4h-4" />
            <path d="M7 10v4h4" />
            <path d="m7 14 1.535-1.605a5 5 0 0 1 8 1.5" />
          </motion.g>
        </svg>
      </div>
    );
  },
);

CloudSyncIcon.displayName = 'CloudSyncIcon';

export { CloudSyncIcon };
