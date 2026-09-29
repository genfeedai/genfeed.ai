import { ComponentSize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import BrandMark from '@ui/primitives/brand-mark';
import type { ComponentPropsWithoutRef } from 'react';
import { spinnerVariants } from './spinner.variants';

export interface SpinnerProps
  extends Omit<ComponentPropsWithoutRef<'output'>, 'size'> {
  size?:
    | ComponentSize.XS
    | ComponentSize.SM
    | ComponentSize.MD
    | ComponentSize.LG;
  ariaLabel?: string;
}

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
