import type {
  FormControlProps,
  FormElementProps,
} from '@props/forms/form.props';
import { cloneElement, isValidElement, type ReactElement, useId } from 'react';

export default function FormControl({
  label,
  description,
  htmlFor,
  error,
  isRequired = false,
  className = '',
  children,
  helpText,
}: FormControlProps) {
  const generatedId = useId();
  const id = htmlFor || generatedId;

  return (
    <div className={`flex flex-col gap-1 w-full mb-5 ${className}`}>
      <label htmlFor={id} className="floating-label">
        {label && (
          <span className="text-sm font-medium capitalize">
            {label}

            {isRequired && <span className="text-error ml-1">*</span>}
          </span>
        )}

        {isValidElement(children)
          ? cloneElement(children as ReactElement<FormElementProps>, {
              'aria-describedby': error ? `${id}-error` : undefined,
              'aria-invalid': error ? 'true' : 'false',
              id,
              // Only pass hasError to custom components, not native DOM elements
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
