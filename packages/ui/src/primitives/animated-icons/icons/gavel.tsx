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

const GAVEL_VARIANTS: Variants = {
  normal: {
    rotate: 0,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
  animate: {
    rotate: [0, -20, 25, 0],
    transition: {
      duration: 0.8,
      times: [0, 0.6, 0.8, 1],
      ease: ['easeInOut', 'easeOut', 'easeOut'],
    },
  },
};

const GavelIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
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
        <motion.svg
          className="size-full"
          animate={controls}
          fill="none"
          height={size}
          initial="normal"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          style={{ transformOrigin: '0% 100%', transformBox: 'fill-box' }}
          variants={GAVEL_VARIANTS}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3l8.384-8.381" />
          <path d="m16 16 6-6" />
          <path d="m21.5 10.5-8-8" />
          <path d="m8 8 6-6" />
          <path d="m8.5 7.5 8 8" />
        </motion.svg>
      </div>
    );
  },
);

GavelIcon.displayName = 'GavelIcon';

export { GavelIcon };
