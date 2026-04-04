'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { FormSelectProps } from '@props/forms/form.props';
import BaseFormField from '@ui/forms/base/base-form-field/BaseFormField';
import { cva } from 'class-variance-authority';
import type { ControllerRenderProps, FieldValues } from 'react-hook-form';

/**
 * CVA select variants with error state support
 */
const selectVariants = cva(
  'flex h-9 border bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: 'border-input',
        error: 'border-destructive focus-visible:ring-destructive',
      },
    },
  },
);

export default function FormSelect<T extends FieldValues = FieldValues>({
  name,
  value,
  label,
  error,
  placeholder = 'Select an option',
  className = '',
  isDisabled = false,
  isRequired = false,
  isFullWidth = true,
  onChange,
  children,
  control,
}: FormSelectProps<T>) {
  const renderSelect = (fieldProps?: ControllerRenderProps<T>) => {
    const selectValue = fieldProps?.value ?? value;
    const selectOnChange = fieldProps?.onChange ?? onChange;

    return (
      <div
        className={cn(
          'flex flex-col gap-1.5',
          isFullWidth ? 'w-full' : 'w-fit',
        )}
      >
        {label && (
          <label className="text-sm font-medium" htmlFor={name}>
            {label}
            {isRequired && <span className="text-destructive ml-1">*</span>}
          </label>
        )}

        <select
          id={name}
          name={fieldProps?.name || name}
          value={selectValue}
          onChange={selectOnChange}
          disabled={isDisabled}
          required={isRequired}
          ref={fieldProps?.ref}
          onBlur={fieldProps?.onBlur}
          className={cn(
            selectVariants({ variant: error ? 'error' : 'default' }),
            isFullWidth ? 'w-full' : '',
            className,
          )}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>

        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    );
  };

  if (control) {
    return (
      <BaseFormField
        name={name}
        control={control}
        onChange={onChange as ((value: unknown) => void) | undefined}
        render={renderSelect}
      />
    );
  }

  return renderSelect();
}
