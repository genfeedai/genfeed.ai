import type { ReactElement } from 'react';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

/** Convenience props for `SimpleTooltip`. */
export interface SimpleTooltipProps {
  label: string;
  children: ReactElement;
  position?: TooltipPosition;
  isDisabled?: boolean;
}
