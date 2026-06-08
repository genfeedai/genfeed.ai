import type { VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/utils';
import { blockquoteVariants } from './blockquote.variants';

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

export { Blockquote };
