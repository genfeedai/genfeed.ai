import type { ComponentSize } from '@genfeedai/enums';
import type { ComponentPropsWithoutRef } from 'react';

export interface SpinnerProps
  extends Omit<ComponentPropsWithoutRef<'span'>, 'size'> {
  size?:
    | ComponentSize.XS
    | ComponentSize.SM
    | ComponentSize.MD
    | ComponentSize.LG;
  ariaLabel?: string;
}
