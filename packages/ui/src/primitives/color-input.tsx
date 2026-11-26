import { cn } from '@genfeedai/helpers';
import type { InputHTMLAttributes } from 'react';
import { fieldFocusClassName } from './field-control';

export interface ColorInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  ref?: React.Ref<HTMLInputElement>;
}

function ColorInput({ ref, className, ...props }: ColorInputProps) {
  return (
    <input
      ref={ref}
      type="color"
      className={cn(
        `h-8 w-10 cursor-pointer rounded border border-white/10 bg-transparent p-1 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-white/10 ${fieldFocusClassName} disabled:cursor-not-allowed disabled:opacity-50`,
        className,
      )}
      {...props}
    />
  );
}

ColorInput.displayName = 'ColorInput';

export { ColorInput };
