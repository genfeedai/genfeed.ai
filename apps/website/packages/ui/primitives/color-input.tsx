import { cn } from '@helpers/formatting/cn/cn.util';
import { forwardRef, type InputHTMLAttributes } from 'react';

export interface ColorInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {}

const ColorInput = forwardRef<HTMLInputElement, ColorInputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="color"
        className={cn(
          'h-8 w-10 cursor-pointer rounded border border-white/[0.08] bg-transparent p-1 shadow-sm transition-all duration-200 hover:border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);

ColorInput.displayName = 'ColorInput';

export { ColorInput };
