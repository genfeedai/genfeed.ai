import { ComponentSize } from '@genfeedai/contracts';
import { cva } from 'class-variance-authority';

/**
 * CVA spinner variants; the animated G mark fills the box
 */
export const spinnerVariants = cva(
  'genfeed-loader-root inline-flex shrink-0 items-center justify-center',
  {
    defaultVariants: {
      size: ComponentSize.MD,
    },
    variants: {
      size: {
        [ComponentSize.LG]: 'size-6',
        [ComponentSize.MD]: 'size-5',
        [ComponentSize.SM]: 'size-4',
        [ComponentSize.XS]: 'size-3',
      },
    },
  },
);
