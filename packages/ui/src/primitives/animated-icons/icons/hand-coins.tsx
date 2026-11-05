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

const CIRCLE_VARIANTS: Variants = {
  normal: {
    translateY: 0,
    opacity: 1,
    transition: {
      opacity: { duration: 0.2 },
      type: 'spring',
      stiffness: 150,
      damping: 15,
      bounce: 0.8,
    },
  },
  animate: {
    opacity: [0, 1],
    translateY: [-20, 0],
    transition: {
      opacity: { duration: 0.2 },
      type: 'spring',
      stiffness: 150,
      damping: 15,
      bounce: 0.8,
    },
  },
};

const SECOND_CIRCLE_VARIANTS: Variants = {
  normal: {
    translateY: 0,
    opacity: 1,
    transition: {
      opacity: { duration: 0.2 },
      delay: 0.15,
      type: 'spring',
      stiffness: 150,
      damping: 15,
      bounce: 0.8,
    },
  },
  animate: {
    opacity: [0, 1],
    translateY: [-20, 0],
    transition: {
      opacity: { duration: 0.2 },
      delay: 0.15,
      type: 'spring',
      stiffness: 150,
      damping: 15,
      bounce: 0.8,
    },
  },
};

const HandCoinsIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
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
          <path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17" />
          <path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" />
          <path d="m2 16 6 6" />
          <motion.circle
            animate={controls}
            cx="16"
            cy="9"
            r="2.9"
            variants={CIRCLE_VARIANTS}
          />
          <motion.circle
            animate={controls}
            cx="6"
            cy="5"
            r="3"
            variants={SECOND_CIRCLE_VARIANTS}
          />
        </svg>
      </div>
    );
  },
);

HandCoinsIcon.displayName = 'HandCoinsIcon';

export { HandCoinsIcon };
