'use client';

import type { FormFieldRenderProps } from '@props/forms/form.props';
import { useCallback } from 'react';
import { type FieldValues, useController } from 'react-hook-form';

export default function BaseFormField<T extends FieldValues>({
  name,
  control,
  render,
  onChange,
  transformValue,
}: FormFieldRenderProps<T>) {
  const controller = useController({
    control: control!,
    name,
  });

  const field = controller.field;

  const handleChange = useCallback(
    (e: unknown) => {
      const transformedEvent = transformValue ? transformValue(e) : e;

      field.onChange(transformedEvent);
      onChange?.(transformedEvent);
    },
    [field, onChange, transformValue],
  );

  const fieldProps = {
    name: field.name || name,
    onBlur: field.onBlur,
    onChange: handleChange,
    ref: field.ref,
    value: field.value,
  };

  return render(fieldProps);
}
