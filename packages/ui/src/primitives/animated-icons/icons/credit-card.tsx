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

const CARD_VARIANTS: Variants = {
  normal: {
    x: 0,
    transition: {
      type: 'spring',
      stiffness: 280,
      damping: 18,
    },
  },
  animate: {
    x: [0, -4, 1.5, 0],
    transition: {
      duration: 0.7,
      times: [0, 0.4, 0.75, 1],
      ease: 'easeInOut',
    },
  },
};

const CreditCardIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
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
          className="size-full overflow-visible"
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
            initial="normal"
            variants={CARD_VARIANTS}
          >
            <rect height="14" rx="2" width="20" x="2" y="5" />
            <line x1="2" x2="22" y1="10" y2="10" />
          </motion.g>
        </svg>
      </div>
    );
  },
);

CreditCardIcon.displayName = 'CreditCardIcon';

export { CreditCardIcon };
