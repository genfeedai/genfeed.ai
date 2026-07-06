'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import {
  Select as ShipSelect,
  SelectContent as ShipSelectContent,
  SelectGroup as ShipSelectGroup,
  SelectItem as ShipSelectItem,
  SelectLabel as ShipSelectLabel,
  SelectSeparator as ShipSelectSeparator,
  SelectTrigger as ShipSelectTrigger,
  SelectValue as ShipSelectValue,
} from '@shipshitdev/ui/primitives';
import { cva } from 'class-variance-authority';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  type ChangeEvent,
  Children,
  type ComponentPropsWithRef,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { Control, FieldValues, Path } from 'react-hook-form';
import { useController } from 'react-hook-form';
import { cn } from '../lib/utils';
import { fieldControlPopoverClassName } from './field-control';
import { Label } from './label';

const Select: typeof ShipSelect = ShipSelect;

const SelectGroup: typeof ShipSelectGroup = ShipSelectGroup;

const SelectValue: typeof ShipSelectValue = ShipSelectValue;

const selectFieldVariants = cva('', {
  defaultVariants: {
    variant: 'default',
  },
  variants: {
    variant: {
      default: '',
      error: 'border-destructive focus:border-destructive',
    },
  },
});

function SelectTrigger({
  ref,
  className,
  children,
  ...props
}: ComponentPropsWithRef<typeof SelectPrimitive.Trigger>) {
  return (
    <ShipSelectTrigger
      ref={ref}
      className={cn('ship-ui', className)}
      {...props}
    >
      {children}
    </ShipSelectTrigger>
  );
}
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

function SelectScrollUpButton({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      ref={ref}
      className={cn(
        'flex cursor-default items-center justify-center py-1',
        className,
      )}
      {...props}
    >
      <ChevronUp className="size-4" aria-hidden="true" />
    </SelectPrimitive.ScrollUpButton>
  );
}
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

function SelectScrollDownButton({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      ref={ref}
      className={cn(
        'flex cursor-default items-center justify-center py-1',
        className,
      )}
      {...props}
    >
      <ChevronDown className="size-4" aria-hidden="true" />
    </SelectPrimitive.ScrollDownButton>
  );
}
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName;

function SelectContent({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof SelectPrimitive.Content>) {
  return (
    <ShipSelectContent
      ref={ref}
      className={cn(fieldControlPopoverClassName, className)}
      {...props}
    />
  );
}
SelectContent.displayName = SelectPrimitive.Content.displayName;

function SelectLabel({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof SelectPrimitive.Label>) {
  return (
    <ShipSelectLabel
      ref={ref}
      className={cn('ship-ui', className)}
      {...props}
    />
  );
}
SelectLabel.displayName = SelectPrimitive.Label.displayName;

function SelectItem({
  ref,
  className,
  children,
  ...props
}: ComponentPropsWithRef<typeof SelectPrimitive.Item>) {
  return (
    <ShipSelectItem ref={ref} className={cn('ship-ui', className)} {...props}>
      {children}
    </ShipSelectItem>
  );
}
SelectItem.displayName = SelectPrimitive.Item.displayName;

function SelectSeparator({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof SelectPrimitive.Separator>) {
  return (
    <ShipSelectSeparator
      ref={ref}
      className={cn('ship-ui', className)}
      {...props}
    />
  );
}
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

interface SelectFieldOption {
  children: ReactNode;
  disabled?: boolean;
  label?: string;
  value: string;
}

export interface SelectFieldProps<T extends FieldValues = FieldValues> {
  children: ReactNode;
  className?: string;
  control?: Control<T>;
  error?: string;
  isDisabled?: boolean;
  isFullWidth?: boolean;
  isRequired?: boolean;
  label?: string;
  name: Path<T> | string;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  placeholder?: string;
  value?: string | number;
}

function extractOptions(children: ReactNode): SelectFieldOption[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) {
      return [];
    }

    const element = child as ReactElement<{
      children?: ReactNode;
      disabled?: boolean;
      label?: string;
      value?: string | number;
    }>;

    if (element.type === 'option') {
      if (element.props.value == null) {
        return [];
      }

      return [
        {
          children: element.props.children,
          disabled: element.props.disabled,
          value: String(element.props.value),
        },
      ];
    }

    if (element.type === 'optgroup') {
      return Children.toArray(element.props.children).flatMap((nestedChild) => {
        if (!isValidElement(nestedChild)) {
          return [];
        }

        const nestedElement = nestedChild as ReactElement<{
          children?: ReactNode;
          disabled?: boolean;
          value?: string | number;
        }>;

        if (
          nestedElement.type !== 'option' ||
          nestedElement.props.value == null
        ) {
          return [];
        }

        return [
          {
            children: nestedElement.props.children,
            disabled: nestedElement.props.disabled,
            label: element.props.label,
            value: String(nestedElement.props.value),
          },
        ];
      });
    }

    return [];
  });
}

function SelectFieldInner<T extends FieldValues = FieldValues>({
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
  fieldName,
  fieldOnBlur,
  fieldOnChange,
  fieldRef,
}: SelectFieldProps<T> & {
  fieldName?: string;
  fieldOnBlur?: () => void;
  fieldOnChange?: (value: string) => void;
  fieldRef?: (element: HTMLInputElement | null) => void;
}) {
  const options = extractOptions(children);

  const selectValue = value != null ? String(value) : undefined;

  const handleValueChange = (nextValue: string) => {
    fieldOnChange?.(nextValue);

    onChange?.({
      currentTarget: { name, value: nextValue },
      target: { name, value: nextValue },
    } as ChangeEvent<HTMLSelectElement>);
  };

  const groupedOptions = options.reduce<Record<string, SelectFieldOption[]>>(
    (groups, option) => {
      const groupKey = option.label || '__ungrouped__';
      groups[groupKey] ??= [];
      groups[groupKey].push(option);
      return groups;
    },
    {},
  );

  return (
    <div
      className={cn('flex flex-col gap-1.5', isFullWidth ? 'w-full' : 'w-fit')}
    >
      {label ? (
        <Label className="text-sm font-medium" htmlFor={name}>
          {label}
          {isRequired ? <span className="text-destructive ml-1">*</span> : null}
        </Label>
      ) : null}

      <Select
        disabled={isDisabled}
        name={fieldName || name}
        value={selectValue}
        onValueChange={handleValueChange}
      >
        <input
          aria-label={label ?? name}
          hidden={true}
          name={fieldName || name}
          onBlur={fieldOnBlur}
          onChange={() => {}}
          ref={fieldRef}
          required={isRequired}
          value={selectValue ?? ''}
        />

        <SelectTrigger
          aria-invalid={error ? 'true' : undefined}
          className={cn(
            selectFieldVariants({ variant: error ? 'error' : 'default' }),
            isFullWidth ? 'w-full' : '',
            className,
          )}
        >
          <SelectValue placeholder={placeholder || undefined} />
        </SelectTrigger>

        <SelectContent>
          {Object.entries(groupedOptions).map(([groupLabel, groupOptions]) => {
            const items = groupOptions.map((option) => (
              <SelectItem
                key={`${groupLabel}-${option.value}`}
                disabled={option.disabled}
                value={option.value}
              >
                {option.children}
              </SelectItem>
            ));

            if (groupLabel === '__ungrouped__') {
              return items;
            }

            return (
              <SelectGroup key={groupLabel}>
                <SelectLabel>{groupLabel}</SelectLabel>
                {items}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>

      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

function HookedSelectField<T extends FieldValues = FieldValues>(
  props: SelectFieldProps<T> & { control: Control<T> },
) {
  const { field } = useController({
    control: props.control,
    name: props.name as Path<T>,
  });

  return (
    <SelectFieldInner
      {...props}
      fieldName={field.name}
      fieldOnBlur={field.onBlur}
      fieldOnChange={field.onChange}
      fieldRef={field.ref}
      value={field.value != null ? String(field.value) : undefined}
    />
  );
}

function SelectField<T extends FieldValues = FieldValues>(
  props: SelectFieldProps<T>,
) {
  if (props.control) {
    return <HookedSelectField {...props} control={props.control} />;
  }

  return <SelectFieldInner {...props} />;
}

export {
  Select,
  SelectContent,
  SelectField,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
