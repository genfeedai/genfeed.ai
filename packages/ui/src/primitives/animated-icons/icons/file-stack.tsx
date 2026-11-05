'use client';

import { cn } from '@genfeedai/helpers';
import type {
  AnimatedIconHandle,
  AnimatedIconProps,
} from '@ui/primitives/animated-icons/animated-icon.types';
import { useAnimatedIconControls } from '@ui/primitives/animated-icons/use-animated-icon-controls';
import { motion } from 'motion/react';
import { forwardRef } from 'react';

const FileStackIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
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
            d="M21 7h-3a2 2 0 0 1-2-2V2"
            variants={{
              normal: { translateX: 0, translateY: 0 },
              animate: { translateX: -4, translateY: 4 },
            }}
          />
          <motion.path
            animate={controls}
            d="M21 6v6.5c0 .8-.7 1.5-1.5 1.5h-7c-.8 0-1.5-.7-1.5-1.5v-9c0-.8.7-1.5 1.5-1.5H17Z"
            variants={{
              normal: { translateX: 0, translateY: 0 },
              animate: { translateX: -4, translateY: 4 },
            }}
          />
          <path d="M7 8v8.8c0 .3.2.6.4.8.2.2.5.4.8.4H15" />
          <motion.path
            animate={controls}
            d="M3 12v8.8c0 .3.2.6.4.8.2.2.5.4.8.4H11"
            variants={{
              normal: { translateX: 0, translateY: 0 },
              animate: { translateX: 4, translateY: -4 },
            }}
          />
        </svg>
      </div>
    );
  },
);

FileStackIcon.displayName = 'FileStackIcon';

export { FileStackIcon };
