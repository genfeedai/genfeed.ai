import { cn } from '@genfeedai/helpers';
import type { VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { kbdVariants } from './kbd.variants';

export interface KbdProps
  extends HTMLAttributes<HTMLElement>,
    VariantProps<typeof kbdVariants> {}

function Kbd({ className, variant, size, ...props }: KbdProps) {
  return (
    <kbd className={cn(kbdVariants({ variant, size }), className)} {...props} />
  );
}

export { Kbd };
