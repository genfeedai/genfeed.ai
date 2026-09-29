import { ComponentSize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { SpinnerProps } from '@genfeedai/props/ui/feedback/spinner.props';
import BrandMark from '@ui/primitives/brand-mark';
import { spinnerVariants } from './spinner.variants';

export default function Spinner({
  size = ComponentSize.MD,
  ariaLabel = 'Loading',
  className = '',
  ...props
}: SpinnerProps = {}) {
  return (
    <output
      className={cn(spinnerVariants({ size }), className)}
      aria-label={ariaLabel}
      {...props}
    >
      <BrandMark />
    </output>
  );
}
