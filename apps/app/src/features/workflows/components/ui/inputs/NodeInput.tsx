'use client';

import { cn } from '@helpers/formatting/cn/cn.util';

interface NodeInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

interface NodeSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: React.ReactNode;
}

interface NodeTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

const baseInputClasses =
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
      <input
        className={cn(baseInputClasses, label && 'mt-1', className)}
        {...props}
      />
    </div>
  );
}

/**
 * Standardized select component for workflow nodes
 */
export function NodeSelect({
  label,
  className,
  children,
  ...props
}: NodeSelectProps): React.JSX.Element {
  return (
    <div>
      {label && (
        <label className="text-xs text-muted-foreground">{label}</label>
      )}
      <select
        className={cn(baseInputClasses, label && 'mt-1', className)}
        {...props}
      >
        {children}
      </select>
    </div>
  );
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
        <label className="text-xs text-muted-foreground">{label}</label>
      )}
      <textarea
        className={cn(baseInputClasses, label && 'mt-1', className)}
        {...props}
      />
    </div>
  );
}
