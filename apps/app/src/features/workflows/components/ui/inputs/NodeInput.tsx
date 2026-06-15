'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import { Input } from '@ui/primitives/input';

interface NodeInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const baseInputClasses =
  'w-full px-2 py-1.5 text-sm bg-background border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary';

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

export { NodeSelect } from './NodeSelect';
export { NodeTextarea } from './NodeTextarea';
