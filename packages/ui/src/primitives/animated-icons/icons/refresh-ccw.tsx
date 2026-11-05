'use client';

import { cn } from '@genfeedai/helpers';
import type {
  AnimatedIconHandle,
  AnimatedIconProps,
} from '@ui/primitives/animated-icons/animated-icon.types';
import { useAnimatedIconControls } from '@ui/primitives/animated-icons/use-animated-icon-controls';
import { motion } from 'motion/react';
import { forwardRef } from 'react';

const RefreshCCWIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
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
            transition={{ type: 'spring', stiffness: 250, damping: 25 }}
            variants={{
              normal: { rotate: '0deg' },
              animate: { rotate: '-50deg' },
            }}
          >
            <path d="M3 2v6h6" />
            <path d="M21 12A9 9 0 0 0 6 5.3L3 8" />
            <path d="M21 22v-6h-6" />
            <path d="M3 12a9 9 0 0 0 15 6.7l3-2.7" />
          </motion.g>
        </svg>
      </div>
    );
  },
);

RefreshCCWIcon.displayName = 'RefreshCCWIcon';

export { RefreshCCWIcon };
