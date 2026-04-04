import { cn } from '@helpers/formatting/cn/cn.util';
import type { FormCheckboxProps } from '@props/forms/form.props';
import { Checkbox } from '@ui/primitives/checkbox';
import { type FieldValues, useController } from 'react-hook-form';

interface CheckboxUIProps {
  name: string;
  isChecked?: boolean;
  isDisabled?: boolean;
  isRequired?: boolean;
  className?: string;
  onCheckedChange: (checked: boolean | 'indeterminate') => void;
  onBlur?: () => void;
  fieldRef?: (el: HTMLButtonElement | null) => void;
}

function CheckboxUI({
  name,
  isChecked,
  isDisabled,
  isRequired,
  className,
  onCheckedChange,
  onBlur,
  fieldRef,
}: CheckboxUIProps): React.ReactElement {
  return (
    <Checkbox
      name={name}
      checked={isChecked}
      disabled={isDisabled}
      required={isRequired}
      onCheckedChange={onCheckedChange}
      onBlur={onBlur}
      ref={fieldRef}
      className={className}
    />
  );
}

function ControlledCheckbox<T extends FieldValues>({
  name,
  label,
  isChecked,
  className = '',
  isDisabled = false,
  isRequired = false,
  onChange,
  control,
}: FormCheckboxProps<T> & {
  control: NonNullable<FormCheckboxProps<T>['control']>;
}): React.ReactElement {
  const { field } = useController({ control, name });

  const handleCheckedChange = (checked: boolean | 'indeterminate'): void => {
    const isCheckedValue = checked === true;
    field.onChange(isCheckedValue);
    if (onChange) {
      const syntheticEvent = {
        target: { checked: isCheckedValue, name: field.name },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    }
  };

  const checkbox = (
    <CheckboxUI
      name={field.name}
      isChecked={isChecked}
      isDisabled={isDisabled}
      isRequired={isRequired}
      className={className}
      onCheckedChange={handleCheckedChange}
      onBlur={field.onBlur}
      fieldRef={field.ref}
    />
  );

  if (label) {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        {checkbox}
        <span className={cn(isDisabled && 'opacity-50')}>{label}</span>
      </label>
    );
  }

  return checkbox;
}

/**
 * FormCheckbox using Radix UI Checkbox primitive
 * Provides accessible checkbox with shadcn-style styling
 */
export default function FormCheckbox<T extends FieldValues>({
  name,
  label,
  value,
  isChecked,
  className = '',
  isDisabled = false,
  isRequired = false,
  onChange,
  control,
}: FormCheckboxProps<T>): React.ReactElement {
  // Use controlled version when control is provided
  if (control) {
    return (
      <ControlledCheckbox
        name={name}
        label={label}
        value={value}
        isChecked={isChecked}
        className={className}
        isDisabled={isDisabled}
        isRequired={isRequired}
        onChange={onChange}
        control={control}
      />
    );
  }

  const handleCheckedChange = (checked: boolean | 'indeterminate'): void => {
    const isCheckedValue = checked === true;
    if (onChange) {
      const syntheticEvent = {
        target: { checked: isCheckedValue, name },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    }
  };

  const checkbox = (
    <CheckboxUI
      name={name}
      isChecked={isChecked}
      isDisabled={isDisabled}
      isRequired={isRequired}
      className={className}
      onCheckedChange={handleCheckedChange}
    />
  );

  if (label) {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        {checkbox}
        <span className={cn(isDisabled && 'opacity-50')}>{label}</span>
      </label>
    );
  }

  return checkbox;
}
