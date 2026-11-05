'use client';

import { cn } from '@genfeedai/helpers';
import type {
  AnimatedIconHandle,
  AnimatedIconProps,
} from '@ui/primitives/animated-icons/animated-icon.types';
import {
  type AnimatedIconSequence,
  useAnimatedIconControls,
} from '@ui/primitives/animated-icons/use-animated-icon-controls';
import type { Transition } from 'motion/react';
import { motion } from 'motion/react';
import { forwardRef } from 'react';

const DEFAULT_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 100,
  damping: 14,
  mass: 1,
};

const SEQUENCE: AnimatedIconSequence = {
  start: async (controls) => {
    await controls.start('firstState');
    await controls.start('secondState');
  },
  stop: (controls) => controls.start('normal'),
};

const LayersIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const { controls, handleMouseEnter, handleMouseLeave } =
      useAnimatedIconControls(ref, { onMouseEnter, onMouseLeave }, SEQUENCE);

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
          <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
          <motion.path
            animate={controls}
            d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { y: 0 },
              firstState: { y: -9 },
              secondState: { y: 0 },
            }}
          />
          <motion.path
            animate={controls}
            d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { y: 0 },
              firstState: { y: -5 },
              secondState: { y: 0 },
            }}
          />
        </svg>
      </div>
    );
  },
);

LayersIcon.displayName = 'LayersIcon';

export { LayersIcon };
