'use client';

import { cn } from '@genfeedai/helpers';
import { useAnimatedIconControls } from '@ui/primitives/animated-icons/use-animated-icon-controls';
import type { Variants } from 'motion/react';
import { motion } from 'motion/react';
import type { HTMLAttributes } from 'react';
import { forwardRef } from 'react';

export interface WaypointsIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface WaypointsIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const VARIANTS: Variants = {
  normal: {
    pathLength: 1,
    opacity: 1,
  },
  animate: (custom: number) => ({
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: {
      delay: 0.15 * custom,
      opacity: { delay: 0.1 * custom },
    },
  }),
};

const WaypointsIcon = forwardRef<WaypointsIconHandle, WaypointsIconProps>(
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
          <motion.circle
            animate={controls}
            custom={0}
            cx="12"
            cy="4.5"
            r="2.5"
            variants={VARIANTS}
          />
          <motion.path
            animate={controls}
            custom={1}
            d="m10.2 6.3-3.9 3.9"
            variants={VARIANTS}
          />
          <motion.circle
            animate={controls}
            custom={0}
            cx="4.5"
            cy="12"
            r="2.5"
            variants={VARIANTS}
          />
          <motion.path
            animate={controls}
            custom={2}
            d="M7 12h10"
            variants={VARIANTS}
          />
          <motion.circle
            animate={controls}
            custom={0}
            cx="19.5"
            cy="12"
            r="2.5"
            variants={VARIANTS}
          />
          <motion.path
            animate={controls}
            custom={3}
            d="m13.8 17.7 3.9-3.9"
            variants={VARIANTS}
          />
          <motion.circle
            animate={controls}
            custom={0}
            cx="12"
            cy="19.5"
            r="2.5"
            variants={VARIANTS}
          />
        </svg>
      </div>
    );
  },
);

WaypointsIcon.displayName = 'WaypointsIcon';

export { WaypointsIcon };
