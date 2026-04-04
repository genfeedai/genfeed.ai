import { cn } from '@helpers/formatting/cn/cn.util';
import type { FormInputProps } from '@props/forms/form.props';
import BaseFormField from '@ui/forms/base/base-form-field/BaseFormField';
import { Input } from '@ui/primitives/input';
import type { FieldValues } from 'react-hook-form';

export default function FormInput<T extends FieldValues>({
  name,
  type = 'text',
  placeholder = '',
  className = '',
  isReadOnly = false,
  isRequired = false,
  isDisabled = false,
  isChecked = false,
  min,
  max,
  step,
  value,
  onChange,
  onBlur,
  onKeyDown,
  control,
  inputRef,
  hasError = false,
}: FormInputProps<T>) {
  const checkableTypes = ['checkbox', 'radio'];
  const isCheckable = checkableTypes.includes(type);
  const inputClassName = cn(
    hasError && 'border-destructive focus-visible:ring-destructive',
    className,
  );

  if (control) {
    return (
      <BaseFormField<T>
        name={name}
        control={control}
        onChange={onChange as ((value: unknown) => void) | undefined}
        render={(fieldProps) => (
          <Input
            {...fieldProps}
            value={fieldProps.value}
            type={type}
            className={inputClassName}
            {...(isCheckable && { checked: isChecked })}
            min={min}
            max={max}
            step={step}
            placeholder={placeholder}
            readOnly={isReadOnly}
            required={isRequired}
            disabled={isDisabled}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            ref={(element) => {
              fieldProps.ref(element);
              if (inputRef) {
                inputRef.current = element;
              }
            }}
          />
        )}
      />
    );
  }

  return (
    <Input
      name={name}
      value={value}
      type={type}
      className={inputClassName}
      {...(isCheckable && { checked: isChecked })}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      readOnly={isReadOnly}
      required={isRequired}
      disabled={isDisabled}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      ref={inputRef || undefined}
    />
  );
}
