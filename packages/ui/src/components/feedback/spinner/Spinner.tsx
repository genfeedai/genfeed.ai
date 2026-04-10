import { ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { SpinnerProps } from '@genfeedai/props/ui/feedback/spinner.props';
import { cva } from 'class-variance-authority';

/**
 * CVA spinner variants with multiple sizes
 */
const spinnerVariants = cva(
  'inline-block animate-spin rounded-full border-2 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]',
  {
    defaultVariants: {
      size: ComponentSize.MD,
    },
    variants: {
      size: {
        [ComponentSize.LG]: 'h-6 w-6 border-2',
        [ComponentSize.MD]: 'h-5 w-5 border-2',
        [ComponentSize.SM]: 'h-4 w-4 border',
        [ComponentSize.XS]: 'h-3 w-3 border',
      },
    },
  },
);

export default function Spinner({
  size = ComponentSize.MD,
  ariaLabel = 'Loading',
  className = '',
  ...props
}: SpinnerProps = {}) {
  return (
    <span
      className={cn(spinnerVariants({ size }), className)}
      role="status"
      aria-label={ariaLabel}
      {...props}
    />
  );
}

export { spinnerVariants };
