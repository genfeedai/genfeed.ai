'use client';

import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../lib/utils';

function Skeleton({ className, ...props }: ComponentPropsWithoutRef<'output'>) {
  return (
    <output
      aria-busy="true"
      className={cn(
        'relative overflow-hidden animate-pulse rounded-md bg-white/[0.06]',
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
