import { ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { SpinnerProps } from '@genfeedai/props/ui/feedback/spinner.props';
import { spinnerVariants } from './spinner.variants';

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
