import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useId,
} from 'react';
import { cn } from '../lib/utils';

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

  return (
    <div className={cn('flex w-full flex-col gap-1 mb-5', className)}>
      <label htmlFor={id} className="floating-label">
        {label && (
          <span className="text-sm font-medium capitalize">
            {label}
            {isRequired && <span className="text-error ml-1">*</span>}
          </span>
        )}

        {isValidElement(children)
          ? cloneElement(children as ReactElement<FieldElementProps>, {
              'aria-describedby': error ? `${id}-error` : undefined,
              'aria-invalid': error ? 'true' : 'false',
              id,
              ...(typeof (children as ReactElement).type !== 'string' && {
                hasError: !!error,
              }),
            })
          : children}
      </label>

      {helpText && (
        <div className="text-xs text-foreground/70 mt-1">{helpText}</div>
      )}

      {description && (
        <p className="text-xs text-foreground/70 mt-1 float-end">
          {description}
        </p>
      )}

      {error && (
        <div id={`${id}-error`} className="text-error text-xs mt-1">
          {error}
        </div>
      )}
    </div>
  );
}
