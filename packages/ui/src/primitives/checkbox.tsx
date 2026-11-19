import { cn } from '@genfeedai/helpers';
import { focusRingClassName } from '@ui/primitives/focus-ring';
import {
  Checkbox as CheckboxControl,
  CheckboxIndicator,
  type CheckedState,
} from '@ui-sdk/react/checkbox';
import { Check, Minus } from 'lucide-react';
import type {
  ChangeEvent,
  ComponentPropsWithoutRef,
  ReactElement,
  ReactNode,
  Ref,
} from 'react';
import type { Control, FieldValues, Path } from 'react-hook-form';
import { useController } from 'react-hook-form';

type CheckboxBaseProps = Omit<
  ComponentPropsWithoutRef<typeof CheckboxControl>,
  'disabled' | 'name' | 'onChange' | 'onCheckedChange' | 'required'
>;

export interface CheckboxProps<T extends FieldValues = FieldValues>
  extends CheckboxBaseProps {
  control?: Control<T>;
  disabled?: boolean;
  isChecked?: boolean;
  isDisabled?: boolean;
  isRequired?: boolean;
  label?: ReactNode;
  name?: Path<T> | string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onCheckedChange?: (checked: CheckedState) => void;
  ref?: Ref<HTMLButtonElement>;
  required?: boolean;
}

interface CheckboxInnerProps<T extends FieldValues = FieldValues>
  extends CheckboxProps<T> {
  checked?: CheckedState;
  externalRef?: Ref<HTMLButtonElement>;
  fieldOnBlur?: () => void;
  fieldOnChange?: (checked: boolean) => void;
  fieldRef?: (element: HTMLButtonElement | null) => void;
}

function CheckboxInner<T extends FieldValues = FieldValues>({
  checked,
  className,
  externalRef,
  fieldOnBlur,
  fieldOnChange,
  fieldRef,
  isChecked,
  isDisabled,
  isRequired,
  label,
  name,
  onBlur,
  onChange,
  onCheckedChange,
  disabled,
  required,
  ...props
}: CheckboxInnerProps<T>): ReactElement {
  const resolvedChecked = checked ?? isChecked;

  const checkbox = (
    <CheckboxControl
      {...props}
      ref={(element) => {
        if (typeof externalRef === 'function') {
          externalRef(element);
        } else if (externalRef) {
          externalRef.current = element;
        }

        fieldRef?.(element);
      }}
      checked={resolvedChecked}
      className={cn(
        'peer inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-border bg-transparent text-primary-foreground shadow-sm transition-colors',
        'data-checked:border-primary data-checked:bg-primary data-indeterminate:border-primary data-indeterminate:bg-primary',
        'not-data-checked:not-data-indeterminate:hover:bg-hover data-disabled:cursor-not-allowed data-disabled:opacity-50',
        focusRingClassName,
        className,
      )}
      disabled={isDisabled ?? disabled}
      name={name}
      onBlur={(event) => {
        fieldOnBlur?.();
        onBlur?.(event);
      }}
      onCheckedChange={(nextChecked) => {
        const isCheckedValue = nextChecked === true;
        fieldOnChange?.(isCheckedValue);
        onCheckedChange?.(nextChecked);

        if (onChange) {
          onChange({
            target: { checked: isCheckedValue, name },
          } as ChangeEvent<HTMLInputElement>);
        }
      }}
      required={isRequired ?? required}
    >
      <CheckboxIndicator className="flex items-center justify-center text-current">
        {(state) =>
          state.indeterminate ? (
            <Minus aria-hidden="true" size={12} strokeWidth={3} />
          ) : (
            <Check aria-hidden="true" size={12} strokeWidth={3} />
          )
        }
      </CheckboxIndicator>
    </CheckboxControl>
  );

  if (!label) {
    return checkbox;
  }

  return (
    <label className="flex cursor-pointer items-center gap-2">
      {checkbox}
      <span className={cn(isDisabled && 'opacity-50')}>{label}</span>
    </label>
  );
}

function HookedCheckboxInner<T extends FieldValues = FieldValues>({
  control,
  ...props
}: CheckboxProps<T> & {
  control: Control<T>;
  externalRef?: Ref<HTMLButtonElement>;
}): ReactElement {
  const { field } = useController({
    control,
    name: props.name as Path<T>,
  });

  return (
    <CheckboxInner
      {...props}
      checked={field.value === true}
      fieldOnBlur={field.onBlur}
      fieldOnChange={field.onChange}
      fieldRef={field.ref}
    />
  );
}

function Checkbox<T extends FieldValues = FieldValues>({
  ref,
  control,
  ...props
}: CheckboxProps<T>) {
  if (control && props.name) {
    return (
      <HookedCheckboxInner {...props} control={control} externalRef={ref} />
    );
  }

  return <CheckboxInner {...props} externalRef={ref} />;
}
Checkbox.displayName = 'Checkbox';

export { Checkbox };
