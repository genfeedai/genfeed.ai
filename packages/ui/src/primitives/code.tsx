import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/utils';

const codeVariants = cva('font-mono', {
  defaultVariants: {
    display: 'inline',
    size: 'sm',
  },
  variants: {
    display: {
      block: 'block bg-white/5 overflow-x-auto',
      inline: 'bg-muted px-1.5 py-0.5',
    },
    size: {
      sm: 'text-xs',
      md: 'text-sm',
      lg: 'text-base',
    },
  },
  compoundVariants: [
    { display: 'block', size: 'sm', className: 'p-2' },
    { display: 'block', size: 'md', className: 'p-3' },
    { display: 'block', size: 'lg', className: 'p-4' },
  ],
});

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

export { Code, codeVariants };
