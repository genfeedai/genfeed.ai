'use client';

import { cn } from '@genfeedai/helpers';
import type {
  AnimatedIconHandle,
  AnimatedIconProps,
} from '@ui/primitives/animated-icons/animated-icon.types';
import { useAnimatedIconControls } from '@ui/primitives/animated-icons/use-animated-icon-controls';
import type { Transition, Variants } from 'motion/react';
import { motion } from 'motion/react';
import { forwardRef } from 'react';

const TRANSITION: Transition = {
  duration: 0.5,
  ease: 'easeInOut',
  repeat: 1,
};

const Y_VARIANTS: Variants = {
  normal: {
    scale: 1,
    rotate: 0,
    opacity: 1,
  },
  animate: {
    scaleY: [1, 1.5, 1],
    opacity: [1, 0.8, 1],
  },
};
const X_VARIANTS: Variants = {
  normal: {
    scale: 1,
    rotate: 0,
    opacity: 1,
  },
  animate: {
    scaleX: [1, 1.5, 1],
    opacity: [1, 0.8, 1],
  },
};

const CpuIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
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
          <rect height="16" rx="2" width="16" x="4" y="4" />
          <rect height="6" rx="1" width="6" x="9" y="9" />
          <motion.path
            animate={controls}
            d="M15 2v2"
            transition={TRANSITION}
            variants={Y_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M15 20v2"
            transition={TRANSITION}
            variants={Y_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M2 15h2"
            transition={TRANSITION}
            variants={X_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M2 9h2"
            transition={TRANSITION}
            variants={X_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M20 15h2"
            transition={TRANSITION}
            variants={X_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M20 9h2"
            transition={TRANSITION}
            variants={X_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M9 2v2"
            transition={TRANSITION}
            variants={Y_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M9 20v2"
            transition={TRANSITION}
            variants={Y_VARIANTS}
          />
        </svg>
      </div>
    );
  },
);

CpuIcon.displayName = 'CpuIcon';

export { CpuIcon };
