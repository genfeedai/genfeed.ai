'use client';

import { cn } from '@genfeedai/helpers';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef } from 'react';

const skeletonVariants = cva(
  [
    'relative block overflow-hidden bg-foreground/5',
    // One sweep of light across the block. It animates `transform`, so it
    // never repaints the page, and it is hidden under reduced motion,
    // leaving the static placeholder.
    'before:absolute before:inset-0',
    'before:bg-gradient-to-r before:from-transparent before:via-foreground/10 before:to-transparent',
    'before:animate-skeleton motion-reduce:before:hidden',
  ],
  {
    defaultVariants: { variant: 'rectangular' },
    variants: {
      variant: {
        circular: 'rounded-full',
        rectangular: 'rounded-md',
        rounded: 'rounded-md',
        text: 'rounded',
      },
    },
  },
);

export interface SkeletonProps
  extends Omit<ComponentPropsWithoutRef<'output'>, 'height' | 'width'>,
    VariantProps<typeof skeletonVariants> {
  height?: number | string;
  width?: number | string;
}

function formatDimension(
  value: number | string | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === 'number' ? `${value}px` : value;
}

function Skeleton({
  className,
  height,
  style,
  variant,
  width,
  ...props
}: SkeletonProps) {
  return (
    <output
      aria-busy="true"
      className={cn(skeletonVariants({ variant }), className)}
      data-slot="skeleton"
      style={{
        height: formatDimension(height),
        width: formatDimension(width),
        ...style,
      }}
      {...props}
    />
  );
}

export { Skeleton, skeletonVariants };
