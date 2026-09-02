import { cn } from '@genfeedai/helpers';
import type { VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { codeVariants } from './code.variants';

export interface CodeProps
  extends HTMLAttributes<HTMLElement>,
    VariantProps<typeof codeVariants> {}

function Code({ className, display, size, ...props }: CodeProps) {
  return (
    <code
      className={cn(codeVariants({ display, size }), className)}
      {...props}
    />
  );
}

export { Code };
