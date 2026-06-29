'use client';

import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * shadcn-API surface that shares the canonical card chrome from
 * packages/ui (rounded-card = near-sharp 2px + inset hairline border).
 * Kept only as a Card/CardContent composition shim for the few public
 * pages that use that API; styling is NOT a second card system.
 */
export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-card bg-card text-card-foreground shadow-border',
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return <div className={cn('p-6', className)} {...props} />;
}
