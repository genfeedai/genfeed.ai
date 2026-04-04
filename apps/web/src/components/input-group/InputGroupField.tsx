'use client';

import type { ActionConfig, ActionUIPattern, FieldWidth } from '@genfeedai/types';
import { clsx } from 'clsx';
import { AlertCircle } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { ActionMenu } from './actions/ActionMenu';
import { ActionToolbar } from './actions/ActionToolbar';

interface InputGroupFieldProps {
  id: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  error?: string;
  actions?: ActionConfig<ReactNode>[];
  actionPattern?: ActionUIPattern;
  disabled?: boolean;
  children: ReactNode;
  width?: FieldWidth;
  className?: string;
}

const WIDTH_CLASSES: Record<FieldWidth, string> = {
  auto: 'w-auto',
  full: 'w-full',
  half: 'w-1/2',
  quarter: 'w-1/4',
  third: 'w-1/3',
};

function InputGroupFieldComponent({
  id,
  label,
  helperText,
  required = false,
  error,
  actions,
  actionPattern = 'hover-toolbar',
  disabled = false,
  children,
  width = 'full',
  className,
}: InputGroupFieldProps) {
  const renderActions = () => {
    if (!actions?.length) return null;

    switch (actionPattern) {
      case 'hover-toolbar':
        return (
          <ActionToolbar
            actions={actions}
            size="sm"
            visible="hover"
            className="absolute right-0 top-0"
          />
        );
      case 'inline-buttons':
        return <ActionToolbar actions={actions} size="sm" visible={true} />;
      case 'dropdown-menu':
        return <ActionMenu actions={actions} />;
      default:
        return null;
    }
  };

  return (
    <div
      className={clsx(
        'relative group',
        WIDTH_CLASSES[width],
        disabled && 'opacity-50 pointer-events-none',
        className
      )}
    >
      {/* Label Row */}
      {(label || actions?.length) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && (
            <label htmlFor={id} className="text-sm font-medium text-[var(--foreground)]">
              {label}
              {required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
          )}
          {actionPattern !== 'hover-toolbar' && renderActions()}
        </div>
      )}

      {/* Input Container */}
      <div className="relative">
        {children}
        {actionPattern === 'hover-toolbar' && actions?.length && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            {renderActions()}
          </div>
        )}
      </div>

      {/* Helper Text */}
      {helperText && !error && (
        <p className="text-xs text-[var(--muted-foreground)] mt-1">{helperText}</p>
      )}

      {/* Error Message */}
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-400 mt-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
}

export const InputGroupField = memo(InputGroupFieldComponent);
