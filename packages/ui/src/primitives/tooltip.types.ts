import type { ReactElement } from 'react';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

/** Convenience props for `SimpleTooltip`. */
export interface SimpleTooltipProps {
  label: string;
  children: ReactElement;
  /** Extra classes for the tooltip surface, such as wrapping a long sentence. */
  contentClassName?: string;
  position?: TooltipPosition;
  isDisabled?: boolean;
}
