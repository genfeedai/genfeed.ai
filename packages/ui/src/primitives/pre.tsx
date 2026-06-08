import type { VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/utils';
import { preVariants } from './pre.variants';

export interface PreProps
  extends HTMLAttributes<HTMLPreElement>,
    VariantProps<typeof preVariants> {}

function Pre({ className, variant, size, ...props }: PreProps) {
  return (
    <pre className={cn(preVariants({ variant, size }), className)} {...props} />
  );
}

export { Pre };
