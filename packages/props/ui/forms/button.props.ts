import { ButtonSize, ButtonVariant, DropdownDirection } from '@genfeedai/enums';
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';

export { ButtonSize, ButtonVariant };

export interface ButtonDropdownOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface ButtonDropdownProps {
  name: string;
  value: string;
  options: readonly ButtonDropdownOption[];
  onChange: (name: string, value: string) => void;
  placeholder?: string;
  className?: string;
  isDisabled?: boolean;
  icon?: ReactNode;
  tooltip?: string;
  triggerDisplay?: 'default' | 'icon-only';
  variant?: ButtonVariant;
}

/**
 * Base button props shared across all button components
 */
export interface BaseButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'children' | 'onClick' | 'onMouseDown' | 'disabled'
  > {
  label?: ReactNode;
  icon?: ReactNode;
  tooltip?: string;
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
  wrapperClassName?: string;
  ariaLabel?: string;
  isLoading?: boolean;
  isDisabled?: boolean;
  isPingEnabled?: boolean;
  textTransform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
  withWrapper?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  onMouseDown?: (e: MouseEvent<HTMLButtonElement>) => void;
}

export interface ButtonRefreshProps {
  onClick: () => void;
  isRefreshing?: boolean;
  className?: string;
  variant?: ButtonVariant;
}

export interface MultiSelectDropdownOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  group?: string;
}

export interface MultiSelectDropdownTab {
  id: string;
  label: string;
}

export interface MultiSelectDropdownProps {
  name: string;
  values: string[];
  options: readonly MultiSelectDropdownOption[];
  onChange: (name: string, values: string[]) => void;
  placeholder?: string;
  className?: string;
  icon?: ReactNode;
  direction?: DropdownDirection;
  isDisabled?: boolean;
  variant?: ButtonVariant;
  tabs?: MultiSelectDropdownTab[];
  defaultTab?: string;
  groupLabels?: Record<string, string>;
  showGroupLabels?: boolean;
  isSearchEnabled?: boolean;
  searchPlaceholder?: string;
}
