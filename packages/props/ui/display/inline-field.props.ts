export interface InlineFieldOption {
  label: string;
  value: string;
}

interface InlineFieldBase {
  /** Names the field for assistive tech; usually the fact's label. */
  ariaLabel: string;
  isDisabled?: boolean;
}

export interface InlineTextFieldEditor extends InlineFieldBase {
  kind: 'text';
  isMultiline?: boolean;
  isRequired?: boolean;
  maxLength?: number;
  onSave: (value: string) => Promise<void> | void;
  placeholder?: string;
  /** API records may carry null for a never-filled field. */
  value?: string | null;
}

export interface InlineNumberFieldEditor extends InlineFieldBase {
  kind: 'number';
  min?: number;
  onSave: (value: number) => Promise<void> | void;
  value?: number;
}

export interface InlineSelectFieldEditor extends InlineFieldBase {
  kind: 'select';
  onSave: (value: string) => Promise<void> | void;
  options: InlineFieldOption[];
  placeholder?: string;
  value?: string;
}

export interface InlineMultiSelectFieldEditor extends InlineFieldBase {
  kind: 'multiselect';
  onSave: (values: string[]) => Promise<void> | void;
  options: InlineFieldOption[];
  /** Shown on the trigger when nothing is selected. */
  placeholder?: string;
  values?: string[];
}

export interface InlineColorFieldEditor extends InlineFieldBase {
  kind: 'color';
  onSave: (value: string) => Promise<void> | void;
  value?: string;
}

export interface InlineSwitchFieldEditor extends InlineFieldBase {
  kind: 'switch';
  isChecked: boolean;
  onSave: (isChecked: boolean) => Promise<void> | void;
}

/**
 * How one field of a record is edited in place in the context sidebar:
 * click, type, blur or Enter saves; Escape cancels. Replaces the Edit button
 * that opened a form modal.
 */
export type InlineFieldEditor =
  | InlineTextFieldEditor
  | InlineNumberFieldEditor
  | InlineSelectFieldEditor
  | InlineMultiSelectFieldEditor
  | InlineColorFieldEditor
  | InlineSwitchFieldEditor;

export interface InlineFieldProps {
  editor: InlineFieldEditor;
  className?: string;
}
