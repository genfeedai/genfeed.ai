import type {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
} from '@genfeedai/enums';
import type {
  ChangeEvent,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  RefObject,
} from 'react';
import type { Control, FieldValues, Path } from 'react-hook-form';

export interface FormDropzoneProps {
  label: string;
  file: File | null;
  onDrop: (file: File) => void;
}

export interface FormDropdownOption {
  key: string | number;
  label: string;
  description?: string;
  thumbnailUrl?: string;
  badge?: string;
  badgeVariant?:
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'info'
    | 'success'
    | 'warning'
    | 'error';
  icon?: ReactNode;
  group?: string;
}

export interface FormDropdownTab {
  id: string;
  label: string;
}

export interface FormDropdownProps {
  name: string;
  value?: string | number;
  className?: string;
  placeholder?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  isFullWidth?: boolean;
  isSearchEnabled?: boolean;
  isNoneEnabled?: boolean;
  icon?: ReactNode;
  label?: string;
  triggerDisplay?: 'default' | 'icon-only';
  variant?: ButtonVariant;
  size?: ButtonSize;
  dropdownDirection?: 'up' | 'down' | 'left' | 'right';
  options: FormDropdownOption[];
  tabs?: FormDropdownTab[];
  defaultTab?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  onSearch?: (searchTerm: string) => void;
  preserveFocus?: boolean;
}

export interface FormControlProps {
  label?: string | ReactNode;
  description?: string;
  htmlFor?: string;
  error?: string;
  isRequired?: boolean;
  className?: string;
  children: ReactNode;
  helpText?: string;
}

export interface FormElementProps {
  id: string;
  'aria-invalid'?: string;
  'aria-describedby'?: string;
  hasError?: boolean;
}

export interface FormDateTimePickerProps {
  label?: string;
  value?: string | Date;
  onChange: (date: Date | null) => void;
  minDate?: Date;
  isRequired?: boolean;
  isDisabled?: boolean;
  className?: string;
  helpText?: string;
  timezone?: string;
}

export interface FormColorPickerProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
  isRequired?: boolean;
  isDisabled?: boolean;
  className?: string;
  helpText?: string;
  pickerType?: 'sketch' | 'chrome' | 'compact';
  showAlpha?: boolean;
  presetColors?: string[];
  position?: 'left' | 'right';
}

export interface FormRangeProps<T extends FieldValues = FieldValues> {
  name: Path<T>;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  className?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  showValue?: boolean;
  showLabels?: boolean;
  minLabel?: string;
  maxLabel?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  control?: Control<T>;
}

export interface FormTagsEditableProps {
  label: string;
  value?: string[];
  placeholder?: string;
  onSave?: (tags: string[]) => void;
  isDisabled?: boolean;
  maxTags?: number;
  className?: string;
}

export interface FormSearchbarProps {
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onSearch?: (value: string) => void;
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
  size?:
    | ComponentSize.XS
    | ComponentSize.SM
    | ComponentSize.MD
    | ComponentSize.LG;
}
