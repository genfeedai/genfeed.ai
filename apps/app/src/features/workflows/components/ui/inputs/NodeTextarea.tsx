'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import { Label } from '@ui/primitives/label';
import { Textarea } from '@ui/primitives/textarea';

import { baseInputClasses } from './NodeInput';

interface NodeTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
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
        <Label className="text-xs text-muted-foreground font-normal">
          {label}
        </Label>
      )}
      <Textarea
        className={cn(baseInputClasses, label && 'mt-1', className)}
        {...props}
      />
    </div>
  );
}
