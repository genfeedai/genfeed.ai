'use client';

import { cn } from '@genfeedai/helpers';
import { useAnimatedIconControls } from '@ui/primitives/animated-icons/use-animated-icon-controls';
import type { Transition } from 'motion/react';
import { motion } from 'motion/react';
import type { HTMLAttributes } from 'react';
import { forwardRef } from 'react';

export interface FrameIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface FrameIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const DEFAULT_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 160,
  damping: 17,
  mass: 1,
};

const FrameIcon = forwardRef<FrameIconHandle, FrameIconProps>(
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
          <motion.line
            animate={controls}
            transition={DEFAULT_TRANSITION}
            variants={{
              animate: { translateY: -4 },
              normal: {
                translateX: 0,
                rotate: 0,
                translateY: 0,
              },
            }}
            x1={22}
            x2={2}
            y1={6}
            y2={6}
          />
          <motion.line
            animate={controls}
            transition={DEFAULT_TRANSITION}
            variants={{
              animate: { translateY: 4 },
              normal: {
                translateX: 0,
                rotate: 0,
                translateY: 0,
              },
            }}
            x1={22}
            x2={2}
            y1={18}
            y2={18}
          />
          <motion.line
            animate={controls}
            transition={DEFAULT_TRANSITION}
            variants={{
              animate: { translateX: -4 },
              normal: {
                translateX: 0,
                rotate: 0,
                translateY: 0,
              },
            }}
            x1={6}
            x2={6}
            y1={2}
            y2={22}
          />
          <motion.line
            animate={controls}
            transition={DEFAULT_TRANSITION}
            variants={{
              animate: { translateX: 4 },
              normal: {
                translateX: 0,
                rotate: 0,
                translateY: 0,
              },
            }}
            x1={18}
            x2={18}
            y1={2}
            y2={22}
          />
        </svg>
      </div>
    );
  },
);

FrameIcon.displayName = 'FrameIcon';

export { FrameIcon };
