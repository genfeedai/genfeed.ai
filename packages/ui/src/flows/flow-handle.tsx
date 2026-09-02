'use client';

import { cn } from '@genfeedai/helpers';
import type { HandleProps } from '@xyflow/react';
import { Handle } from '@xyflow/react';
import { cva, type VariantProps } from 'class-variance-authority';

const flowHandleVariants = cva(
  'flow-handle border border-background shadow-sm',
  {
    defaultVariants: {
      size: 'default',
      tone: 'default',
    },
    variants: {
      size: {
        default: 'h-3 w-3',
        lg: 'h-3.5 w-3.5',
        sm: 'h-2.5 w-2.5',
      },
      tone: {
        accent: 'flow-handle-accent',
        audio: 'flow-handle-audio',
        danger: 'flow-handle-danger',
        default: 'flow-handle-default',
        image: 'flow-handle-image',
        info: 'flow-handle-info',
        number: 'flow-handle-number',
        success: 'flow-handle-success',
        text: 'flow-handle-text',
        video: 'flow-handle-video',
        warning: 'flow-handle-warning',
      },
    },
  },
);

export type FlowHandleTone = NonNullable<
  VariantProps<typeof flowHandleVariants>['tone']
>;

export type FlowHandleProps = HandleProps &
  VariantProps<typeof flowHandleVariants>;

export function FlowHandle({
  className,
  tone,
  size,
  ...props
}: FlowHandleProps) {
  return (
    <Handle
      className={cn(flowHandleVariants({ size, tone }), className)}
      {...props}
    />
  );
}

export { flowHandleVariants };
