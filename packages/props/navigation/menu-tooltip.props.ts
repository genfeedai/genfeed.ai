import type {
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
  ReactElement,
} from 'react';

export interface MenuTooltipProps {
  label: string;
  children: ReactElement;
}

export interface TooltipWrapperProps {
  children: ReactElement;
  onMouseEnter: (event: MouseEvent<HTMLElement>) => void;
  onMouseLeave: (event: MouseEvent<HTMLElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  'aria-label': string;
}
