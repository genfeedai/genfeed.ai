'use client';

import { cn } from '@genfeedai/helpers';
import { useAnimatedIconControls } from '@ui/primitives/animated-icons/use-animated-icon-controls';
import type { Transition } from 'motion/react';
import { motion } from 'motion/react';
import type { HTMLAttributes } from 'react';
import { forwardRef } from 'react';

export interface ChevronUpIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ChevronUpIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const DEFAULT_TRANSITION: Transition = {
  times: [0, 0.4, 1],
  duration: 0.5,
};

const ChevronUpIcon = forwardRef<ChevronUpIconHandle, ChevronUpIconProps>(
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
          <motion.path
            animate={controls}
            d="m18 15-6-6-6 6"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { y: 0 },
              animate: { y: [0, -2, 0] },
            }}
          />
        </svg>
      </div>
    );
  },
);

ChevronUpIcon.displayName = 'ChevronUpIcon';

export { ChevronUpIcon };
