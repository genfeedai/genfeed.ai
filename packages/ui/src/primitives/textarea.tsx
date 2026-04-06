import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/utils';
import { fieldControlClassName } from './field-control';

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          fieldControlClassName,
          'min-h-textarea h-auto resize-y',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
