'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { cva } from 'class-variance-authority';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import {
  type ChangeEvent,
  Children,
  type ComponentPropsWithoutRef,
  forwardRef,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { Control, FieldValues, Path } from 'react-hook-form';
import { useController } from 'react-hook-form';
import { cn } from '../lib/utils';
import {
  fieldControlClassName,
  fieldControlPopoverClassName,
  fieldControlTriggerClassName,
} from './field-control';

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const selectFieldVariants = cva('', {
  defaultVariants: {
    variant: 'default',
  },
  variants: {
    variant: {
      default: '',
      error: 'border-destructive focus-visible:ring-destructive',
    },
  },
});

const SelectTrigger = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
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
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      'flex cursor-default items-center justify-center py-1',
      className,
    )}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      'flex cursor-default items-center justify-center py-1',
      className,
    )}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        'relative z-50 max-h-96 min-w-[8rem] overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        fieldControlPopoverClassName,
        position === 'popper' &&
          'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
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
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn('px-2 py-1.5 text-sm font-semibold', className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
));
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
        <label className="text-sm font-medium" htmlFor={name}>
          {label}
          {isRequired ? <span className="text-destructive ml-1">*</span> : null}
        </label>
      ) : null}

      <Select
        disabled={isDisabled}
        name={fieldName || name}
        value={selectValue}
        onValueChange={handleValueChange}
      >
        <input
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
