import type { ReactNode, RefCallback } from 'react';
import type { Control, FieldValues, Path } from 'react-hook-form';

export interface BaseFormFieldProps<T extends FieldValues> {
  name: Path<T>;
  control?: Control<T>;
  onChange?: (value: unknown) => void;
  transformValue?: (value: unknown) => unknown;
  render: (fieldProps: IBaseFormFieldRenderProps) => ReactNode;
}

export interface IBaseFormFieldRenderProps {
  name: string;
  value?: unknown;
  ref?: RefCallback<HTMLElement>;
  onBlur?: () => void;
  onChange: (value: unknown) => void;
}
