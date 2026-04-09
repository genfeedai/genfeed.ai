'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import { Input } from '@ui/primitives/input';
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Select as UiSelect,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useId,
} from 'react';

interface NodeInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

interface NodeSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: React.ReactNode;
  placeholder?: string;
}

interface NodeTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

const baseInputClasses =
  'w-full px-2 py-1.5 text-sm bg-background border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary';

interface NodeSelectOption {
  children: ReactNode;
  disabled?: boolean;
  groupLabel?: string;
  value: string;
}

function extractSelectOptions(children: ReactNode): NodeSelectOption[] {
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
            groupLabel: element.props.label,
            value: String(nestedElement.props.value),
          },
        ];
      });
    }

    return [];
  });
}

/**
 * Standardized input component for workflow nodes
 */
export function NodeInput({
  label,
  className,
  ...props
}: NodeInputProps): React.JSX.Element {
  return (
    <div>
      {label && (
        <label className="text-xs text-muted-foreground">{label}</label>
      )}
      <Input
        className={cn(baseInputClasses, label && 'mt-1', className)}
        {...props}
      />
    </div>
  );
}

/**
 * Standardized select component for workflow nodes
 */
export function NodeSelect({
  label,
  className,
  children,
  disabled,
  id,
  onBlur,
  onChange,
  placeholder,
  value,
  defaultValue,
}: NodeSelectProps): React.JSX.Element {
  const selectId = useId();
  const resolvedId = id ?? selectId;
  const options = extractSelectOptions(children);
  const optionGroups = options.reduce<
    Map<string | undefined, NodeSelectOption[]>
  >((groups, option) => {
    const existing = groups.get(option.groupLabel) ?? [];
    existing.push(option);
    groups.set(option.groupLabel, existing);
    return groups;
  }, new Map());

  const currentValue = value != null ? String(value) : undefined;
  const currentDefaultValue =
    defaultValue != null ? String(defaultValue) : undefined;

  return (
    <div>
      {label && (
        <label htmlFor={resolvedId} className="text-xs text-muted-foreground">
          {label}
        </label>
      )}
      <UiSelect
        defaultValue={currentDefaultValue}
        disabled={disabled}
        value={currentValue}
        onOpenChange={(open) => {
          if (!open) {
            onBlur?.({
              currentTarget: {} as HTMLSelectElement,
              target: {} as HTMLSelectElement,
            } as React.FocusEvent<HTMLSelectElement>);
          }
        }}
        onValueChange={(nextValue) => {
          onChange?.({
            currentTarget: { value: nextValue } as HTMLSelectElement,
            target: { value: nextValue } as HTMLSelectElement,
          } as React.ChangeEvent<HTMLSelectElement>);
        }}
      >
        <SelectTrigger
          id={resolvedId}
          className={cn(baseInputClasses, 'h-auto', label && 'mt-1', className)}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {Array.from(optionGroups.entries()).map(
            ([groupLabel, groupOptions]) => (
              <SelectGroup key={groupLabel ?? '__ungrouped'}>
                {groupLabel && <SelectLabel>{groupLabel}</SelectLabel>}
                {groupOptions.map((option) => (
                  <SelectItem
                    key={`${groupLabel ?? 'option'}-${option.value}`}
                    disabled={option.disabled}
                    value={option.value}
                  >
                    {option.children}
                  </SelectItem>
                ))}
              </SelectGroup>
            ),
          )}
        </SelectContent>
      </UiSelect>
    </div>
  );
}

/**
 * Standardized textarea component for workflow nodes
 */
export function NodeTextarea({
  label,
  className,
  ...props
}: NodeTextareaProps): React.JSX.Element {
  return (
    <div>
      {label && (
        <label className="text-xs text-muted-foreground">{label}</label>
      )}
      <Textarea
        className={cn(baseInputClasses, label && 'mt-1', className)}
        {...props}
      />
    </div>
  );
}
