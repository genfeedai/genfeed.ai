'use client';

import { cn } from '@genfeedai/helpers';
import { DismissableLayer } from '@radix-ui/react-dismissable-layer';
import { renderElement } from '@ui-sdk/react/primitive';
import {
  SelectTrigger as SelectButton,
  SelectValue as SelectCurrent,
  SelectSeparator as SelectDivider,
  SelectGroup,
  SelectGroupLabel,
  SelectItemIndicator,
  SelectItem as SelectOption,
  SelectContent as SelectPopup,
  Select as SelectRoot,
  type SelectProps as SelectRootProps,
} from '@ui-sdk/react/select';
import { cva } from 'class-variance-authority';
import { Check, ChevronsUpDown } from 'lucide-react';
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
import {
  fieldControlClassName,
  fieldControlPopoverClassName,
  fieldControlTriggerClassName,
} from './field-control';
import { Label } from './label';

/**
 * An item with an empty value stands for "none" in a form. ui-sdk reports a
 * cleared choice as null, so the empty string travels as a sentinel and the
 * callers keep reading and writing ''.
 */
export const EMPTY_SELECT_ITEM_VALUE = '__genfeed_empty_select_item__';

function toSelectItemValue(value: string): string {
  return value === '' ? EMPTY_SELECT_ITEM_VALUE : value;
}

function fromSelectItemValue(value: string): string {
  return value === EMPTY_SELECT_ITEM_VALUE ? '' : value;
}

export interface SelectProps
  extends Omit<
    SelectRootProps<string, false>,
    'defaultValue' | 'multiple' | 'onValueChange' | 'value'
  > {
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  value?: string;
}

function Select({ defaultValue, onValueChange, value, ...props }: SelectProps) {
  return (
    <SelectRoot
      {...props}
      defaultValue={
        defaultValue == null ? defaultValue : toSelectItemValue(defaultValue)
      }
      value={value == null ? value : toSelectItemValue(value)}
      onValueChange={(nextValue) => {
        // ui-sdk reports null when nothing is chosen; the owner of the value
        // already knows.
        if (nextValue !== null) {
          onValueChange?.(fromSelectItemValue(nextValue));
        }
      }}
    />
  );
}

/**
 * What the trigger shows: the chosen option's text, or the placeholder while
 * nothing is chosen. An empty value is the sentinel, which ui-sdk would show as
 * text when no option has it, so that reads as nothing chosen too.
 */
function SelectValue({
  children,
  placeholder,
  ...props
}: ComponentPropsWithRef<typeof SelectCurrent>) {
  return (
    <SelectCurrent {...props} placeholder={placeholder}>
      {children ??
        ((state) => {
          if (state.placeholder || state.label === EMPTY_SELECT_ITEM_VALUE) {
            return placeholder;
          }

          return state.label;
        })}
    </SelectCurrent>
  );
}
SelectValue.displayName = 'SelectValue';

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
  hideIndicator = false,
  ...props
}: Omit<ComponentPropsWithRef<typeof SelectButton>, 'children'> & {
  children?: ReactNode;
  /** Drop the chevron when the trigger is itself a pill or badge. */
  hideIndicator?: boolean;
}) {
  return (
    <SelectButton
      ref={ref}
      className={cn(
        fieldControlClassName,
        fieldControlTriggerClassName,
        'dropdown-case',
        className,
      )}
      {...props}
    >
      {children}
      {hideIndicator ? null : (
        <ChevronsUpDown
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </SelectButton>
  );
}
SelectTrigger.displayName = 'SelectTrigger';

function SelectContent({
  ref,
  className,
  children,
  render,
  ...props
}: ComponentPropsWithRef<typeof SelectPopup>) {
  return (
    <SelectPopup
      ref={ref}
      className={cn(
        'max-h-[min(24rem,var(--available-height))] min-w-[max(8rem,var(--anchor-width))] overflow-y-auto border-0 p-1',
        fieldControlPopoverClassName,
        className,
      )}
      render={(partProps, state) => (
        <>
          {renderElement('div', partProps, render, state)}
          {/* Yield the outer Radix overlay's Escape handler to the open Select. */}
          {state.open ? <DismissableLayer hidden /> : null}
        </>
      )}
      {...props}
    >
      {children}
    </SelectPopup>
  );
}
SelectContent.displayName = 'SelectContent';

/** The heading of a group of items. */
function SelectLabel({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof SelectGroupLabel>) {
  return (
    <SelectGroupLabel
      ref={ref}
      className={cn(
        'px-2 py-1.5 font-semibold text-2xs text-muted-foreground uppercase tracking-label',
        className,
      )}
      {...props}
    />
  );
}
SelectLabel.displayName = 'SelectLabel';

function SelectItem({
  ref,
  className,
  children,
  value,
  ...props
}: Omit<ComponentPropsWithRef<typeof SelectOption>, 'children' | 'value'> & {
  children?: ReactNode;
  value: string;
}) {
  return (
    <SelectOption
      ref={ref}
      className={cn(
        'dropdown-case relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pr-2 pl-8 text-sm text-foreground outline-none data-highlighted:bg-hover data-highlighted:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50',
        className,
      )}
      value={toSelectItemValue(value)}
      {...props}
    >
      {children}
      <SelectItemIndicator className="absolute left-2 flex size-3.5 items-center justify-center">
        <Check className="size-4" aria-hidden="true" />
      </SelectItemIndicator>
    </SelectOption>
  );
}
SelectItem.displayName = 'SelectItem';

function SelectSeparator({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof SelectDivider>) {
  return (
    <SelectDivider
      ref={ref}
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}
SelectSeparator.displayName = 'SelectSeparator';

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
  /**
   * The options are user-authored text (organization or brand names), so keep
   * their casing instead of the product-wide Title Case of dropdowns.
   */
  isTextCaseKept?: boolean;
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
  isTextCaseKept = false,
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
          aria-label={label ?? name}
          className={cn(
            selectFieldVariants({ variant: error ? 'error' : 'default' }),
            isFullWidth ? 'w-full' : '',
            isTextCaseKept && 'normal-case',
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
                className={isTextCaseKept ? 'normal-case' : undefined}
                disabled={option.disabled}
                label={
                  typeof option.children === 'string'
                    ? option.children
                    : undefined
                }
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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
