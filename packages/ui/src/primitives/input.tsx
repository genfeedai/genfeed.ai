import { Input as ShipInput } from '@shipshitdev/ui/primitives';
import type {
  ChangeEvent,
  FocusEvent,
  InputHTMLAttributes,
  ReactElement,
  Ref,
  RefObject,
} from 'react';
import {
  type Control,
  type FieldValues,
  type Path,
  useController,
} from 'react-hook-form';
import { cn } from '../lib/utils';
import {
  fieldControlClassName,
  fieldControlInputClassName,
} from './field-control';
import { Label } from './label';

export interface InputProps<T extends FieldValues = FieldValues>
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    | 'checked'
    | 'disabled'
    | 'name'
    | 'onBlur'
    | 'onChange'
    | 'readOnly'
    | 'required'
  > {
  control?: Control<T>;
  disabled?: boolean;
  hasError?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  isChecked?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  label?: string;
  name?: Path<T> | string;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  ref?: Ref<HTMLInputElement>;
  required?: boolean;
}

interface InputBaseProps<T extends FieldValues = FieldValues>
  extends Omit<InputProps<T>, 'control' | 'inputRef'> {
  externalRef?: Ref<HTMLInputElement>;
  inputRef?: RefObject<HTMLInputElement | null>;
}

function assignRef(
  ref: Ref<HTMLInputElement> | RefObject<HTMLInputElement | null> | undefined,
  value: HTMLInputElement | null,
) {
  if (typeof ref === 'function') {
    ref(value);
    return;
  }

  if (ref && 'current' in ref) {
    ref.current = value;
  }
}

function renderInput<T extends FieldValues = FieldValues>({
  className,
  externalRef,
  hasError = false,
  id,
  inputRef,
  isChecked,
  isDisabled,
  isReadOnly,
  isRequired,
  label,
  name,
  onBlur,
  onChange,
  disabled,
  required,
  type,
  value,
  ...props
}: InputBaseProps<T>) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const isCheckable = type === 'checkbox' || type === 'radio';
  const inputClassName = cn(
    fieldControlClassName,
    fieldControlInputClassName,
    hasError && 'border-destructive focus-visible:border-destructive',
    className,
  );

  const input = (
    <ShipInput
      {...props}
      checked={isCheckable ? isChecked : undefined}
      className={inputClassName}
      disabled={isDisabled ?? disabled}
      id={inputId}
      name={name}
      onBlur={onBlur}
      onChange={onChange}
      readOnly={isReadOnly}
      ref={(element) => {
        assignRef(externalRef, element);
        assignRef(inputRef, element);
      }}
      required={isRequired ?? required}
      type={type}
      value={isCheckable ? undefined : (value ?? '')}
    />
  );

  if (label) {
    return (
      <div className="space-y-1.5">
        <Label
          htmlFor={inputId}
          className="text-sm font-medium text-foreground"
        >
          {label}
        </Label>
        {input}
      </div>
    );
  }

  return input;
}

function ControlledInputInner<T extends FieldValues = FieldValues>({
  control,
  externalRef,
  inputRef,
  isChecked,
  onBlur,
  onChange,
  type,
  value,
  ...props
}: InputProps<T> & {
  control: Control<T>;
  externalRef?: Ref<HTMLInputElement>;
}) {
  const controller = useController({
    control,
    name: props.name as Path<T>,
  });

  const isCheckable = type === 'checkbox' || type === 'radio';
  const resolvedChecked = isCheckable
    ? (isChecked ?? Boolean(controller.field.value))
    : undefined;
  const resolvedValue = isCheckable
    ? value
    : (controller.field.value ?? value ?? '');

  return renderInput({
    ...props,
    externalRef,
    inputRef,
    isChecked: resolvedChecked,
    name: controller.field.name,
    onBlur: (event) => {
      controller.field.onBlur();
      onBlur?.(event);
    },
    onChange: (event) => {
      controller.field.onChange(event);
      onChange?.(event);
    },
    type,
    value: resolvedValue,
  });
}

function Input<T extends FieldValues = FieldValues>({
  ref,
  control,
  inputRef,
  ...props
}: InputProps<T>): ReactElement {
  if (control && props.name) {
    return (
      <ControlledInputInner
        {...props}
        control={control}
        externalRef={ref}
        inputRef={inputRef}
      />
    );
  }

  return renderInput({
    ...props,
    externalRef: ref,
    inputRef,
  });
}

Input.displayName = 'Input';

export { Input };
