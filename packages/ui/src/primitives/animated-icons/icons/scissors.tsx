'use client';

import type {
  AnimatedIconHandle,
  AnimatedIconProps,
} from '@ui/primitives/animated-icons/animated-icon.types';
import { useAnimatedIconControls } from '@ui/primitives/animated-icons/use-animated-icon-controls';

// Not in lucide-animated: drawn here on Lucide's Scissors geometry, following
// the registry's component contract.

import { cn } from '@genfeedai/helpers';
import { motion } from 'motion/react';
import { forwardRef } from 'react';

const ScissorsIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
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
          {/* Each blade is its handle ring plus its edge; both pivot on the
              rivet at 12,12 and close twice: a snip. */}
          <motion.g
            animate={controls}
            style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }}
            transition={{ duration: 0.45, ease: 'easeInOut' }}
            variants={{
              animate: { rotate: [0, 9, 0, 9, 0] },
              normal: { rotate: 0 },
            }}
          >
            <circle cx="6" cy="6" r="3" />
            <path d="M8.12 8.12 12 12" />
            <path d="M14.8 14.8 20 20" />
          </motion.g>
          <motion.g
            animate={controls}
            style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }}
            transition={{ duration: 0.45, ease: 'easeInOut' }}
            variants={{
              animate: { rotate: [0, -9, 0, -9, 0] },
              normal: { rotate: 0 },
            }}
          >
            <circle cx="6" cy="18" r="3" />
            <path d="M20 4 8.12 15.88" />
          </motion.g>
        </svg>
      </div>
    );
  },
);

ScissorsIcon.displayName = 'ScissorsIcon';

export { ScissorsIcon };
