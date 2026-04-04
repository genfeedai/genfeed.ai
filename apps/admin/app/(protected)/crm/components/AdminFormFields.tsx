'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import { Input, type InputProps } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea, type TextareaProps } from '@ui/primitives/textarea';
import {
  Children,
  type ComponentProps,
  isValidElement,
  type ReactNode,
} from 'react';

const FIELD_CONTAINER_CLASS = 'flex flex-col gap-1.5';
const FIELD_LABEL_CLASS = 'text-sm text-foreground/60';
const FIELD_INPUT_CLASS = 'bg-white/5';
const EMPTY_SELECT_VALUE = '__empty__';

interface BaseFieldProps {
  containerClassName?: string;
  id: string;
  label: string;
  required?: boolean;
}

type AdminInputFieldProps = BaseFieldProps & Omit<InputProps, 'id'>;

type AdminSelectFieldProps = BaseFieldProps &
  Omit<ComponentProps<typeof Select>, 'children'> & {
    className?: string;
    children: ReactNode;
    onChange?: (event: { target: { value: string } }) => void;
  };

type AdminTextareaFieldProps = BaseFieldProps & Omit<TextareaProps, 'id'>;

function renderSelectItems(children: ReactNode) {
  return Children.map(children, (child, index) => {
    if (!isValidElement(child) || child.type !== 'option') {
      return null;
    }

    const props = child.props as {
      children: ReactNode;
      disabled?: boolean;
      value?: string;
    };
    const optionValue =
      props.value === '' || props.value == null
        ? EMPTY_SELECT_VALUE
        : props.value;

    return (
      <SelectItem
        key={`${optionValue}-${index}`}
        value={optionValue}
        disabled={props.disabled}
      >
        {props.children}
      </SelectItem>
    );
  });
}

export function AdminInputField({
  containerClassName,
  id,
  label,
  required = false,
  className,
  ...props
}: AdminInputFieldProps) {
  return (
    <div className={cn(FIELD_CONTAINER_CLASS, containerClassName)}>
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        {label}
        {required ? ' *' : ''}
      </label>
      <Input id={id} className={cn(FIELD_INPUT_CLASS, className)} {...props} />
    </div>
  );
}

export function AdminSelectField({
  containerClassName,
  id,
  label,
  required = false,
  className,
  children,
  onChange,
  onValueChange,
  value,
  ...props
}: AdminSelectFieldProps) {
  return (
    <div className={cn(FIELD_CONTAINER_CLASS, containerClassName)}>
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        {label}
        {required ? ' *' : ''}
      </label>
      <Select
        {...props}
        value={value === '' ? EMPTY_SELECT_VALUE : value}
        onValueChange={(nextValue) => {
          const normalizedValue =
            nextValue === EMPTY_SELECT_VALUE ? '' : nextValue;
          onValueChange?.(normalizedValue);
          onChange?.({ target: { value: normalizedValue } });
        }}
      >
        <SelectTrigger id={id} className={cn(FIELD_INPUT_CLASS, className)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{renderSelectItems(children)}</SelectContent>
      </Select>
    </div>
  );
}

export function AdminTextareaField({
  containerClassName,
  id,
  label,
  required = false,
  className,
  ...props
}: AdminTextareaFieldProps) {
  return (
    <div className={cn(FIELD_CONTAINER_CLASS, containerClassName)}>
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        {label}
        {required ? ' *' : ''}
      </label>
      <Textarea
        id={id}
        className={cn(FIELD_INPUT_CLASS, className)}
        {...props}
      />
    </div>
  );
}
