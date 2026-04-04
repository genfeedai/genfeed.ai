'use client';

import type { ActionConfig, ActionUIPattern } from '@genfeedai/types';
import { clsx } from 'clsx';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { ActionMenu } from './actions/ActionMenu';
import { ActionToolbar } from './actions/ActionToolbar';

interface InputGroupHeaderProps {
  title: string;
  description?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onCollapseToggle?: () => void;
  actions?: ActionConfig<ReactNode>[];
  actionPattern?: ActionUIPattern;
  isEditing?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
  className?: string;
}

function InputGroupHeaderComponent({
  title,
  description,
  collapsible = false,
  collapsed = false,
  onCollapseToggle,
  actions,
  actionPattern = 'dropdown-menu',
  isEditing = false,
  onSave,
  onCancel,
  className,
}: InputGroupHeaderProps) {
  const renderActions = () => {
    if (!actions?.length) return null;

    switch (actionPattern) {
      case 'hover-toolbar':
      case 'inline-buttons':
        return (
          <ActionToolbar
            actions={actions}
            size="sm"
            visible={actionPattern === 'inline-buttons' ? true : 'hover'}
          />
        );
      case 'dropdown-menu':
        return <ActionMenu actions={actions} />;
      default:
        return null;
    }
  };

  return (
    <div className={clsx('flex items-start gap-2', className)}>
      {/* Collapse Toggle */}
      {collapsible && (
        <button
          type="button"
          onClick={onCollapseToggle}
          className="p-0.5 rounded hover:bg-[var(--border)] transition-colors shrink-0 mt-0.5"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand section' : 'Collapse section'}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" />
          )}
        </button>
      )}

      {/* Title & Description */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-[var(--foreground)] truncate">{title}</h3>
        {description && (
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{description}</p>
        )}
      </div>

      {/* Edit Mode Actions */}
      {isEditing && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onSave}
            className="p-1.5 rounded bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-colors"
            aria-label="Save changes"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
            aria-label="Cancel changes"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Regular Actions */}
      {!isEditing && renderActions()}
    </div>
  );
}

export const InputGroupHeader = memo(InputGroupHeaderComponent);
