import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Checkbox as ShipCheckbox } from '@shipshitdev/ui/primitives';
import {
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  forwardRef,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import type { Control, FieldValues, Path } from 'react-hook-form';
import { useController } from 'react-hook-form';
import { cn } from '../lib/utils';

type CheckboxBaseProps = Omit<
  ComponentPropsWithoutRef<typeof ShipCheckbox>,
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
  onCheckedChange?: (checked: CheckboxPrimitive.CheckedState) => void;
  required?: boolean;
}

interface CheckboxInnerProps<T extends FieldValues = FieldValues>
  extends CheckboxProps<T> {
  checked?: CheckboxPrimitive.CheckedState;
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
    <ShipCheckbox
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
      className={cn('ship-ui', className)}
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
    />
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

const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ control, ...props }, ref) => {
    if (control && props.name) {
      return (
        <HookedCheckboxInner {...props} control={control} externalRef={ref} />
      );
    }

    return <CheckboxInner {...props} externalRef={ref} />;
  },
);
Checkbox.displayName =
  ShipCheckbox.displayName ?? CheckboxPrimitive.Root.displayName;

export { Checkbox };
