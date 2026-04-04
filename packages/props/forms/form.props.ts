import type { DateRange } from '@cloud/interfaces/utils/date.interface';
import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  Timeframe,
} from '@genfeedai/enums';
import type {
  ChangeEvent,
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  RefObject,
} from 'react';
import type {
  Control,
  ControllerRenderProps,
  FieldValues,
  Path,
  UseFormRegisterReturn,
} from 'react-hook-form';

export interface FormTextareaProps<T extends FieldValues> {
  name: Path<T>;
  placeholder?: string;
  defaultValue?: string;
  value?: string;
  className?: string;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  onChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onFocus?: (e: FocusEvent<HTMLTextAreaElement>) => void;
  onBlur?: (e: FocusEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  control?: Control<T, any, any>;
  register?: UseFormRegisterReturn<Path<T>>;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  maxLength?: number;
  rows?: number;
  hasError?: boolean;
  /** Max height in pixels before scrollbar appears (auto-resize will stop at this height) */
  maxHeight?: number;
}

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

export interface FormInputProps<T extends FieldValues> {
  name: Path<T>;
  type?:
    | 'text'
    | 'color'
    | 'number'
    | 'email'
    | 'url'
    | 'password'
    | 'checkbox'
    | 'datetime-local'
    | 'hidden';
  placeholder?: string;
  className?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  value?: string | number;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  isRequired?: boolean;
  isReadOnly?: boolean;
  isDisabled?: boolean;
  isChecked?: boolean;
  control?: Control<T, any, any>;
  inputRef?: RefObject<HTMLInputElement | null>;
  hasError?: boolean;
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

export interface FormToggleProps {
  label?: string;
  description?: string;
  isChecked: boolean;
  isDisabled?: boolean;
  switchClassName?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
}

export interface FormCheckboxProps<T extends FieldValues = FieldValues> {
  name: Path<T>;
  label?: ReactNode;
  value?: boolean;
  isChecked?: boolean;
  className?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  control?: Control<T, any, any>;
}

export interface FormSelectProps<T extends FieldValues = FieldValues> {
  name: Path<T>;
  value?: string | number;
  label?: string;
  error?: string;
  placeholder?: string;
  className?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  isFullWidth?: boolean;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
  control?: Control<T, any, any>;
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

export interface FormDatepickerProps {
  label: string;
  value: string | Date | null;
  onChange: (date: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
  isRequired?: boolean;
  isDisabled?: boolean;
  className?: string;
  helpText?: string;
  placeholderText?: string;
  dateFormat?: string;
  showYearDropdown?: boolean;
  showMonthDropdown?: boolean;
  dropdownMode?: 'scroll' | 'select';
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
  control?: Control<T, any, any>;
}

export interface FormFieldRenderProps<T extends FieldValues = FieldValues> {
  name: Path<T>;
  control?: Control<T, any, any>;
  render: (fieldProps: ControllerRenderProps<T>) => ReactNode;
  onChange?: (value: unknown) => void;
  transformValue?: (value: unknown) => unknown;
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

export interface FormDateRangePickerProps {
  onChange: (range: DateRange) => void;
  defaultPreset?: Timeframe.D7 | Timeframe.D30 | Timeframe.D90;
  className?: string;
}
