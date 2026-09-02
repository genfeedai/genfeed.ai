'use client';

import { cn } from '@genfeedai/helpers';
import * as SelectPrimitive from '@radix-ui/react-select';
import { cva } from 'class-variance-authority';
import { Check, ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import {
  type ChangeEvent,
  Children,
  type ComponentProps,
  type ComponentPropsWithRef,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { Control, FieldValues, Path } from 'react-hook-form';
import { useController } from 'react-hook-form';
import {
  fieldControlClassName,
  fieldControlPopoverClassName,
  fieldControlTriggerClassName,
} from './field-control';
import { Label } from './label';

/** Radix reserves the empty string for clearing a selection. */
export const EMPTY_SELECT_ITEM_VALUE = '__genfeed_empty_select_item__';

function toSelectItemValue(value: string): string {
  return value === '' ? EMPTY_SELECT_ITEM_VALUE : value;
}

function fromSelectItemValue(value: string): string {
  return value === EMPTY_SELECT_ITEM_VALUE ? '' : value;
}

function Select({
  defaultValue,
  onValueChange,
  value,
  ...props
}: ComponentProps<typeof SelectPrimitive.Root>) {
  return (
    <SelectPrimitive.Root
      {...props}
      defaultValue={
        defaultValue == null ? defaultValue : toSelectItemValue(defaultValue)
      }
      value={value == null ? value : toSelectItemValue(value)}
      onValueChange={(nextValue) =>
        onValueChange?.(fromSelectItemValue(nextValue))
      }
    />
  );
}

const SelectGroup: typeof SelectPrimitive.Group = SelectPrimitive.Group;

const SelectValue: typeof SelectPrimitive.Value = SelectPrimitive.Value;

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
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        fieldControlClassName,
        fieldControlTriggerClassName,
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronsUpDown
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
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
  children,
  position = 'popper',
  ...props
}: ComponentPropsWithRef<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          'relative max-h-96 min-w-[8rem] overflow-hidden',
          position === 'popper' && 'translate-y-1',
          fieldControlPopoverClassName,
          className,
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            'p-1',
            position === 'popper' &&
              'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]',
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}
SelectContent.displayName = SelectPrimitive.Content.displayName;

function SelectLabel({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn(
        'px-2 py-1.5 font-semibold text-2xs text-muted-foreground uppercase tracking-wide',
        className,
      )}
      {...props}
    />
  );
}
SelectLabel.displayName = SelectPrimitive.Label.displayName;

function SelectItem({
  ref,
  className,
  children,
  value,
  ...props
}: ComponentPropsWithRef<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pr-2 pl-8 text-sm text-foreground outline-none focus:bg-hover focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      value={toSelectItemValue(value)}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4" aria-hidden="true" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}
SelectItem.displayName = SelectPrimitive.Item.displayName;

function SelectSeparator({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn('-mx-1 my-1 h-px bg-border', className)}
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
          value: toSelectItemValue(String(element.props.value)),
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
            value: toSelectItemValue(String(nestedElement.props.value)),
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

  const rawSelectValue = value != null ? String(value) : undefined;
  const selectValue =
    rawSelectValue === '' ? EMPTY_SELECT_ITEM_VALUE : rawSelectValue;

  const handleValueChange = (nextValue: string) => {
    const fieldValue = fromSelectItemValue(nextValue);
    fieldOnChange?.(fieldValue);

    onChange?.({
      currentTarget: { name, value: fieldValue },
      target: { name, value: fieldValue },
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
          value={rawSelectValue ?? ''}
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
