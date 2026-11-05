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
import type { Variants } from 'motion/react';
import { motion } from 'motion/react';
import { forwardRef } from 'react';

const LINE_VARIANTS: Variants = {
  visible: { pathLength: 1, opacity: 1 },
  hidden: { pathLength: 0, opacity: 0 },
};

const SEQUENCE: AnimatedIconSequence = {
  start: async (controls) => {
    await controls.start((i) => ({
      pathLength: 0,
      opacity: 0,
      transition: { delay: i * 0.1, duration: 0.3 },
    }));
    await controls.start((i) => ({
      pathLength: 1,
      opacity: 1,
      transition: { delay: i * 0.1, duration: 0.3 },
    }));
  },
  stop: (controls) => controls.start('visible'),
};

const ChartColumnIncreasingIcon = forwardRef<
  AnimatedIconHandle,
  AnimatedIconProps
>(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
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
        <motion.path
          animate={controls}
          custom={1}
          d="M13 17V9"
          initial="visible"
          variants={LINE_VARIANTS}
        />
        <motion.path
          animate={controls}
          custom={2}
          d="M18 17V5"
          initial="visible"
          variants={LINE_VARIANTS}
        />
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        <motion.path
          animate={controls}
          custom={0}
          d="M8 17v-3"
          initial="visible"
          variants={LINE_VARIANTS}
        />
      </svg>
    </div>
  );
});

ChartColumnIncreasingIcon.displayName = 'ChartColumnIncreasingIcon';

export { ChartColumnIncreasingIcon };
