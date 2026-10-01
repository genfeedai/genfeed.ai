import type { ChangeEvent, KeyboardEvent, MouseEvent, RefObject } from 'react';

export interface FormSearchbarProps {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  onClear?: () => void;
  showIcon?: boolean;
  showClearButton?: boolean;
  isDisabled?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  onClick?: (e: MouseEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** Rest as an icon. Expand on click; collapse on blur when the field is empty. */
  isCollapsible?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}
