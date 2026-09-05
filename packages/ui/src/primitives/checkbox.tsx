import { cn } from '@genfeedai/helpers';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
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
  ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
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
  ref?: Ref<HTMLButtonElement>;
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
    <CheckboxPrimitive.Root
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
        'peer inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-border bg-transparent text-primary-foreground shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=checked]:bg-primary data-[state=unchecked]:hover:bg-hover',
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
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {resolvedChecked === 'indeterminate' ? (
          <Minus size={12} strokeWidth={3} />
        ) : (
          <Check size={12} strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
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
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
