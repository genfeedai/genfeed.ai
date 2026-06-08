import { cva } from 'class-variance-authority';

export const blockquoteVariants = cva('border-l-4 pl-4', {
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
