'use client';

import type { ActionConfig, ActionUIPattern } from '@genfeedai/types';
import { clsx } from 'clsx';
import { Copy, GripVertical, Trash2 } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { ActionToolbar } from './actions/ActionToolbar';

interface InputGroupRowProps<T = Record<string, unknown>> {
  index: number;
  data: T;
  isDragging?: boolean;
  sortable?: boolean;
  actions?: ActionConfig<ReactNode>[];
  actionPattern?: ActionUIPattern;
  onChange: (data: T) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  children: ReactNode;
  className?: string;
}

function InputGroupRowComponent<T = Record<string, unknown>>({
  index,
  isDragging = false,
  sortable = false,
  actions,
  actionPattern = 'hover-toolbar',
  onDelete,
  onDuplicate,
  children,
  className,
}: InputGroupRowProps<T>) {
  // Build default actions if handlers are provided
  const defaultActions: ActionConfig<ReactNode>[] = [];

  if (onDuplicate) {
    defaultActions.push({
      category: 'crud',
      icon: <Copy className="w-full h-full" />,
      id: `duplicate-${index}`,
      label: 'Duplicate',
      onClick: onDuplicate,
      type: 'duplicate',
    });
  }

  if (onDelete) {
    defaultActions.push({
      category: 'crud',
      danger: true,
      icon: <Trash2 className="w-full h-full" />,
      id: `delete-${index}`,
      label: 'Delete',
      onClick: onDelete,
      type: 'delete',
    });
  }

  const allActions = [...(actions || []), ...defaultActions];

  return (
    <div
      className={clsx(
        'group relative flex items-center gap-2 p-2 rounded',
        'border border-transparent hover:border-[var(--border)] hover:bg-[var(--card)]/50',
        'transition-all',
        isDragging && 'opacity-50 border-[var(--primary)] bg-[var(--primary)]/10',
        className
      )}
      data-index={index}
    >
      {/* Drag Handle */}
      {sortable && (
        <button
          type="button"
          className={clsx(
            'cursor-grab active:cursor-grabbing p-0.5 rounded',
            'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--border)]',
            'opacity-0 group-hover:opacity-100 transition-opacity'
          )}
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}

      {/* Row Content */}
      <div className="flex-1 min-w-0">{children}</div>

      {/* Row Actions */}
      {allActions.length > 0 && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <ActionToolbar
            actions={allActions}
            size="sm"
            visible={actionPattern === 'hover-toolbar' ? 'hover' : true}
          />
        </div>
      )}
    </div>
  );
}

export const InputGroupRow = memo(InputGroupRowComponent) as typeof InputGroupRowComponent;
