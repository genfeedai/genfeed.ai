import type { TooltipPositionType } from '@genfeedai/contracts';
import type { ReactElement } from 'react';

/** Convenience props for `SimpleTooltip`. */
export interface SimpleTooltipProps {
  label: string;
  children: ReactElement;
  position?: TooltipPositionType;
  isDisabled?: boolean;
}
