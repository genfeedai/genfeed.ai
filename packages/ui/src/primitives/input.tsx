import { cn } from '@genfeedai/helpers';
import { Input as TextInput } from '@ui-sdk/react/input';
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
import {
  fieldControlClassName,
  fieldControlInputClassName,
} from './field-control';
import { Label } from './label';

const WHITESPACE_RUNS_PATTERN = /\s+/g;

export interface InputProps<T extends FieldValues = FieldValues>
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    | 'checked'
    | 'defaultValue'
    | 'disabled'
    | 'name'
    | 'onBlur'
    | 'onChange'
    | 'readOnly'
    | 'required'
    | 'value'
  > {
  control?: Control<T>;
  /** The text a form reset returns to. */
  defaultValue?: string | number | readonly string[];
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
  value?: string | number | readonly string[];
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

/** ui-sdk keeps a text value as a string; a number or a list reads as its text. */
function toInputText(
  value: string | number | readonly string[] | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === 'object' ? value.join(',') : String(value);
}

function renderInput<T extends FieldValues = FieldValues>({
  className,
  defaultValue,
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
  const inputId =
    id || label?.toLowerCase().replace(WHITESPACE_RUNS_PATTERN, '-');
  const isNativeOnly =
    type === 'checkbox' || type === 'radio' || type === 'file';
  const inputClassName = cn(
    fieldControlClassName,
    fieldControlInputClassName,
    hasError && 'border-destructive focus-visible:border-destructive',
    className,
  );

  const input = isNativeOnly ? (
    <input
      {...props}
      checked={isChecked}
      className={inputClassName}
      defaultValue={defaultValue}
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
    />
  ) : (
    <TextInput
      {...props}
      className={inputClassName}
      defaultValue={toInputText(defaultValue)}
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
      value={toInputText(value) ?? ''}
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
