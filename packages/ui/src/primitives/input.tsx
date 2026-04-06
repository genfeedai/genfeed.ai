import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/utils';
import {
  fieldControlClassName,
  fieldControlInputClassName,
} from './field-control';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    if (label) {
      return (
        <div className="space-y-1.5">
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </label>
          <input
            id={inputId}
            type={type}
            className={cn(
              fieldControlClassName,
              fieldControlInputClassName,
              className,
            )}
            ref={ref}
            {...props}
          />
        </div>
      );
    }

    return (
      <input
        id={inputId}
        type={type}
        className={cn(
          fieldControlClassName,
          fieldControlInputClassName,
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
