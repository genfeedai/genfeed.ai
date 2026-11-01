'use client';

import { cn } from '@genfeedai/helpers';
import type { ComponentPropsWithoutRef } from 'react';

function Skeleton({ className, ...props }: ComponentPropsWithoutRef<'output'>) {
  return (
    <output
      aria-busy="true"
      className={cn(
        'relative block overflow-hidden rounded-md bg-foreground/5',
        // One sweep of light across the block. It animates `transform`, so it
        // never repaints the page, and it is hidden under reduced motion,
        // leaving the static placeholder.
        'before:absolute before:inset-0',
        'before:bg-gradient-to-r before:from-transparent before:via-foreground/10 before:to-transparent',
        'before:animate-skeleton motion-reduce:before:hidden',
        className,
      )}
      data-slot="skeleton"
      {...props}
    />
  );
}

export { Skeleton };
