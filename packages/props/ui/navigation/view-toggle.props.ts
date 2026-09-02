import type { ComponentSize, ViewType } from '@genfeedai/contracts';
import type { ReactNode } from 'react';

export interface ViewOption<TView extends ViewType = ViewType> {
  type: TView;
  icon: ReactNode;
  label: string;
  ariaLabel?: string;
}

export interface ViewToggleProps<TView extends ViewType = ViewType> {
  /**
   * Available view options to toggle between
   */
  options: ViewOption<TView>[];

  /**
   * Currently active view type
   */
  activeView: TView;

  /**
   * Callback when view type changes
   */
  onChange: (view: TView) => void;

  /**
   * Additional CSS classes for the wrapper
   */
  className?: string;

  /**
   * Size of the toggle buttons
   * @default 'sm'
   */
  size?:
    | ComponentSize.XS
    | ComponentSize.SM
    | ComponentSize.MD
    | ComponentSize.LG;
}
