import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/utils';

const blockquoteVariants = cva('border-l-4 pl-4', {
  defaultVariants: {
    variant: 'default',
  },
  variants: {
    variant: {
      default: 'border-primary/60 italic text-foreground/70',
      subtle: 'border-border italic text-muted-foreground',
      accent: 'border-accent italic text-foreground/80',
    },
  },
});

export interface BlockquoteProps
  extends HTMLAttributes<HTMLQuoteElement>,
    VariantProps<typeof blockquoteVariants> {}

function Blockquote({ className, variant, ...props }: BlockquoteProps) {
  return (
    <blockquote
      className={cn(blockquoteVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Blockquote, blockquoteVariants };
