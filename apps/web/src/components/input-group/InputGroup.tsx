'use client';

import type { ActionConfig, ActionUIPattern, InputGroupVariant } from '@genfeedai/types';
import { clsx } from 'clsx';
import { AlertCircle, Loader2 } from 'lucide-react';
import { memo, type ReactNode, useState } from 'react';
import { InputGroupHeader } from './InputGroupHeader';

interface InputGroupProps {
  id: string;
  title?: string;
  description?: string;
  variant?: InputGroupVariant;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  isEditing?: boolean;
  actions?: ActionConfig<ReactNode>[];
  actionPattern?: ActionUIPattern;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  onEditChange?: (isEditing: boolean) => void;
  onCollapseChange?: (collapsed: boolean) => void;
  children: ReactNode;
  className?: string;
}

const VARIANT_STYLES: Record<InputGroupVariant, string> = {
  card: 'p-4 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-sm',
  inline: 'p-2',
  minimal: '',
  section: 'p-4 bg-[var(--card)] border border-[var(--border)] rounded-lg',
};

function InputGroupComponent({
  id,
  title,
  description,
  variant = 'section',
  collapsible = false,
  defaultCollapsed = false,
  isEditing = false,
  actions,
  actionPattern = 'dropdown-menu',
  disabled = false,
  loading = false,
  error,
  onEditChange,
  onCollapseChange,
  children,
  className,
}: InputGroupProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const handleCollapseToggle = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    onCollapseChange?.(newCollapsed);
  };

  const handleSave = () => {
    onEditChange?.(false);
  };

  const handleCancel = () => {
    onEditChange?.(false);
  };

  return (
    <div
      id={id}
      className={clsx(
        'relative',
        VARIANT_STYLES[variant],
        disabled && 'opacity-50 pointer-events-none',
        className
      )}
    >
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-[var(--background)]/50 flex items-center justify-center rounded-lg z-10">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
        </div>
      )}

      {/* Header */}
      {(title || actions?.length) && (
        <InputGroupHeader
          title={title || ''}
          description={description}
          collapsible={collapsible}
          collapsed={collapsed}
          onCollapseToggle={handleCollapseToggle}
          actions={actions}
          actionPattern={actionPattern}
          isEditing={isEditing}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}

      {/* Content */}
      {!collapsed && <div className={clsx(title && 'mt-3')}>{children}</div>}

      {/* Error Message */}
      {error && (
        <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

export const InputGroup = memo(InputGroupComponent);
