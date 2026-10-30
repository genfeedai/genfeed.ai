import type { ViewType } from '@genfeedai/contracts';
import type { ReactNode } from 'react';

export interface ViewOption<TView extends ViewType = ViewType> {
  type: TView;
  icon: ReactNode;
  label: string;
  ariaLabel?: string;
}
