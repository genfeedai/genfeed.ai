import { ComponentSize } from '@genfeedai/enums';
import { cva } from 'class-variance-authority';

/**
 * CVA spinner variants with multiple sizes
 */
export const spinnerVariants = cva(
  'inline-block animate-spin rounded-full border-2 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]',
  {
    defaultVariants: {
      size: ComponentSize.MD,
    },
    variants: {
      size: {
        [ComponentSize.LG]: 'size-6 border-2',
        [ComponentSize.MD]: 'size-5 border-2',
        [ComponentSize.SM]: 'size-4 border',
        [ComponentSize.XS]: 'size-3 border',
      },
    },
  },
);
