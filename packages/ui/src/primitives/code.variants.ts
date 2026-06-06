import { cva } from 'class-variance-authority';

export const codeVariants = cva('font-mono', {
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
