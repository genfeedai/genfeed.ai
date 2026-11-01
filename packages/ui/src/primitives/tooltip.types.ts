import type { ReactElement } from 'react';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

/** Convenience props for `SimpleTooltip`. */
export interface SimpleTooltipProps {
  /** No label, no tooltip: the child renders as is. */
  label: string | undefined;
  children: ReactElement;
  /** Extra classes for the tooltip surface, such as wrapping a long sentence. */
  contentClassName?: string;
  position?: TooltipPosition;
  isDisabled?: boolean;
}
