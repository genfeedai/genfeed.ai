import { ComponentSize, ViewType } from '@genfeedai/enums';
import type { ReactNode } from 'react';

export interface ViewOption {
  type: ViewType;
  icon: ReactNode;
  label: string;
  ariaLabel?: string;
}

export interface ViewToggleProps {
  /**
   * Available view options to toggle between
   */
  options: ViewOption[];

  /**
   * Currently active view type
   */
  activeView: ViewType;

  /**
   * Callback when view type changes
   */
  onChange: (view: ViewType) => void;

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
