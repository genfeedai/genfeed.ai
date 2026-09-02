'use client';

import { cn } from '@genfeedai/helpers';
import type { ComponentPropsWithoutRef } from 'react';

function Skeleton({ className, ...props }: ComponentPropsWithoutRef<'output'>) {
  return (
    <output
      aria-busy="true"
      className={cn(
        'relative overflow-hidden animate-pulse rounded-md bg-muted',
        'before:absolute before:inset-0',
        'before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent',
        'before:animate-shimmer',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
