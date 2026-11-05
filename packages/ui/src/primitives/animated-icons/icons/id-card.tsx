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

const VARIANTS: Variants = {
  normal: {
    pathLength: 1,
    opacity: 1,
  },
  animate: (custom: number) => ({
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: {
      duration: 0.3,
      delay: custom * 0.1,
    },
  }),
};

const IdCardIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
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
          <motion.path
            animate={controls}
            custom={2}
            d="M16 10h2"
            variants={VARIANTS}
          />
          <motion.path
            animate={controls}
            custom={2}
            d="M16 14h2"
            variants={VARIANTS}
          />
          <motion.path
            animate={controls}
            custom={0}
            d="M6.17 15a3 3 0 0 1 5.66 0"
            variants={VARIANTS}
          />
          <motion.circle
            animate={controls}
            custom={1}
            cx="9"
            cy="11"
            r="2"
            variants={VARIANTS}
          />
          <rect height="14" rx="2" width="20" x="2" y="5" />
        </svg>
      </div>
    );
  },
);

IdCardIcon.displayName = 'IdCardIcon';

export { IdCardIcon };
