import type { ITag } from '@genfeedai/interfaces';

export interface EditFormData {
  editValue: string;
}

/**
 * Base editable form props shared across editable components
 */
export interface BaseEditableProps {
  label?: string;
  className?: string;
  isDisabled?: boolean;
  placeholder?: string;
}

export interface FormInputEditableProps extends BaseEditableProps {
  value?: string;
  onSave: (value: string) => Promise<void> | void;
  inputClassName?: string;
  displayClassName?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  type?: 'text' | 'email' | 'url';
  validateFn?: (value: string) => string | null;
}

/**
 * Props for editable tag components that work with ITag objects
 */
export interface TagsEditableProps extends BaseEditableProps {
  label: string;
  value: string[];
  onSave?: (tags: ITag[]) => void;
  maxTags?: number;
}
