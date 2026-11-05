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

const FLIP_DURATION = 0.12;
const FLIP_STAGGER = 0.06;

const FLIP_OUT_VARIANTS: Variants = {
  normal: (custom: number) => ({
    rotateX: 0,
    opacity: 1,
    transition: {
      duration: FLIP_DURATION,
      delay: custom * FLIP_STAGGER + FLIP_DURATION,
    },
  }),
  animate: (custom: number) => ({
    rotateX: -90,
    opacity: 0,
    transition: {
      duration: FLIP_DURATION,
      delay: custom * FLIP_STAGGER,
    },
  }),
};

const FLIP_IN_VARIANTS: Variants = {
  normal: (custom: number) => ({
    rotateX: 90,
    opacity: 0,
    transition: {
      duration: FLIP_DURATION,
      delay: custom * FLIP_STAGGER,
    },
  }),
  animate: (custom: number) => ({
    rotateX: 0,
    opacity: 1,
    transition: {
      duration: FLIP_DURATION,
      delay: custom * FLIP_STAGGER + FLIP_DURATION,
    },
  }),
};

const BinaryIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
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
            custom={0}
            height="6"
            initial="normal"
            rx="2"
            variants={FLIP_OUT_VARIANTS}
            width="4"
            x="6"
            y="4"
          />
          <motion.g
            animate={controls}
            custom={0}
            initial="normal"
            variants={FLIP_IN_VARIANTS}
          >
            <path d="M6 4h2v6" />
            <path d="M6 10h4" />
          </motion.g>

          <motion.g
            animate={controls}
            custom={1}
            initial="normal"
            variants={FLIP_OUT_VARIANTS}
          >
            <path d="M14 4h2v6" />
            <path d="M14 10h4" />
          </motion.g>
          <motion.rect
            animate={controls}
            custom={1}
            height="6"
            initial="normal"
            rx="2"
            variants={FLIP_IN_VARIANTS}
            width="4"
            x="14"
            y="4"
          />

          <motion.g
            animate={controls}
            custom={2}
            initial="normal"
            variants={FLIP_OUT_VARIANTS}
          >
            <path d="M6 14h2v6" />
            <path d="M6 20h4" />
          </motion.g>
          <motion.rect
            animate={controls}
            custom={2}
            height="6"
            initial="normal"
            rx="2"
            variants={FLIP_IN_VARIANTS}
            width="4"
            x="6"
            y="14"
          />

          <motion.rect
            animate={controls}
            custom={3}
            height="6"
            initial="normal"
            rx="2"
            variants={FLIP_OUT_VARIANTS}
            width="4"
            x="14"
            y="14"
          />
          <motion.g
            animate={controls}
            custom={3}
            initial="normal"
            variants={FLIP_IN_VARIANTS}
          >
            <path d="M14 14h2v6" />
            <path d="M14 20h4" />
          </motion.g>
        </svg>
      </div>
    );
  },
);

BinaryIcon.displayName = 'BinaryIcon';

export { BinaryIcon };
