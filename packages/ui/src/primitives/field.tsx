import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useId,
} from 'react';
import { cn } from '../lib/utils';
import { Label } from './label';

export interface FieldElementProps {
  id: string;
  'aria-invalid'?: string;
  'aria-describedby'?: string;
  hasError?: boolean;
}

export interface FieldProps {
  children?: ReactNode;
  className?: string;
  description?: string;
  error?: string;
  helpText?: string;
  htmlFor?: string;
  isRequired?: boolean;
  label?: ReactNode;
}

export default function Field({
  children,
  className = '',
  description,
  error,
  helpText,
  htmlFor,
  isRequired = false,
  label,
}: FieldProps) {
  const generatedId = useId();
  const id = htmlFor || generatedId;
  const helpTextId = helpText ? `${id}-help` : undefined;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpTextId, descriptionId, errorId]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      {label ? (
        <Label htmlFor={id}>
          {label}
          {isRequired ? <span className="ml-1 text-destructive">*</span> : null}
        </Label>
      ) : null}

      {isValidElement(children)
        ? cloneElement(children as ReactElement<FieldElementProps>, {
            'aria-describedby': describedBy || undefined,
            'aria-invalid': error ? 'true' : 'false',
            id,
            ...(typeof (children as ReactElement).type !== 'string' && {
              hasError: !!error,
            }),
          })
        : children}

      {helpText ? (
        <p id={helpTextId} className="text-sm text-muted-foreground">
          {helpText}
        </p>
      ) : null}

      {description ? (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
