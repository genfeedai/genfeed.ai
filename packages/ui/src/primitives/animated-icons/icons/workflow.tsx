'use client';

import { cn } from '@genfeedai/helpers';
import { useAnimatedIconControls } from '@ui/primitives/animated-icons/use-animated-icon-controls';
import type { Transition, Variants } from 'motion/react';
import { motion } from 'motion/react';
import type { HTMLAttributes } from 'react';
import { forwardRef } from 'react';

export interface WorkflowIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface WorkflowIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const TRANSITION: Transition = {
  duration: 0.3,
  opacity: { delay: 0.15 },
};

const VARIANTS: Variants = {
  normal: {
    pathLength: 1,
    opacity: 1,
  },
  animate: (custom: number) => ({
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: {
      ...TRANSITION,
      delay: 0.1 * custom,
    },
  }),
};

const WorkflowIcon = forwardRef<WorkflowIconHandle, WorkflowIconProps>(
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
            height="8"
            rx="2"
            variants={VARIANTS}
            width="8"
            x="3"
            y="3"
          />
          <motion.path
            animate={controls}
            custom={3}
            d="M7 11v4a2 2 0 0 0 2 2h4"
            variants={VARIANTS}
          />
          <motion.rect
            animate={controls}
            custom={0}
            height="8"
            rx="2"
            variants={VARIANTS}
            width="8"
            x="13"
            y="13"
          />
        </svg>
      </div>
    );
  },
);

WorkflowIcon.displayName = 'WorkflowIcon';

export { WorkflowIcon };
