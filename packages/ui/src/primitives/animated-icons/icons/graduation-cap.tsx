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

const CAP_VARIANTS: Variants = {
  normal: {
    rotate: 0,
  },
  animate: {
    y: [0, -2, 0],
    rotate: [0, -2, 2, 0],
    transition: {
      duration: 0.6,
      ease: 'easeInOut',
    },
  },
};

const TASSEL_VARIANTS: Variants = {
  normal: { rotate: 0 },
  animate: {
    rotate: [0, 15, -10, 5, 0],
    transition: {
      duration: 0.8,
      ease: 'easeInOut',
      delay: 0.1,
    },
  },
};

const GraduationCapIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
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
          <motion.g
            animate={controls}
            style={{ transformOrigin: '12px 12px' }}
            variants={CAP_VARIANTS}
          >
            <path d="M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />

            <motion.path
              d="M22 10v6"
              style={{
                transformBox: 'fill-box',
                transformOrigin: 'top center',
              }}
              variants={TASSEL_VARIANTS}
            />
          </motion.g>
        </svg>
      </div>
    );
  },
);

GraduationCapIcon.displayName = 'GraduationCapIcon';

export { GraduationCapIcon };
