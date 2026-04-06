import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/utils';

const preVariants = cva(
  'overflow-x-auto whitespace-pre-wrap break-words font-mono',
  {
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
    variants: {
      variant: {
        default: 'bg-muted text-muted-foreground',
        debug:
          'bg-background border border-border text-muted-foreground max-h-64 overflow-y-auto',
        ghost: 'bg-transparent text-muted-foreground',
      },
      size: {
        xs: 'text-[10px] p-2',
        sm: 'text-xs p-3',
        md: 'text-sm p-4',
      },
    },
  },
);

export interface PreProps
  extends HTMLAttributes<HTMLPreElement>,
    VariantProps<typeof preVariants> {}

function Pre({ className, variant, size, ...props }: PreProps) {
  return (
    <pre className={cn(preVariants({ variant, size }), className)} {...props} />
  );
}

export { Pre, preVariants };
