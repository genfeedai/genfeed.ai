'use client';

import type {
  ActionConfig,
  ToolbarOrientation,
  ToolbarSize,
  ToolbarVisibility,
} from '@genfeedai/types';
import { clsx } from 'clsx';
import { memo, type ReactNode } from 'react';

interface ActionToolbarProps {
  actions: ActionConfig<ReactNode>[];
  size?: ToolbarSize;
  orientation?: ToolbarOrientation;
  visible?: ToolbarVisibility;
  className?: string;
}

const SIZE_CLASSES: Record<ToolbarSize, { button: string; icon: string }> = {
  lg: { button: 'p-2', icon: 'w-5 h-5' },
  md: { button: 'p-1.5', icon: 'w-4 h-4' },
  sm: { button: 'p-1', icon: 'w-3.5 h-3.5' },
};

function ActionToolbarComponent({
  actions,
  size = 'sm',
  orientation = 'horizontal',
  visible = true,
  className,
}: ActionToolbarProps) {
  const visibleActions = actions.filter((action) => !action.hidden);

  if (visibleActions.length === 0) return null;

  const sizeClasses = SIZE_CLASSES[size];

  return (
    <div
      className={clsx(
        'flex gap-0.5 rounded bg-[var(--card)] border border-[var(--border)] p-0.5',
        orientation === 'vertical' ? 'flex-col' : 'flex-row',
        visible === 'hover' && 'opacity-0 group-hover:opacity-100',
        visible === true && 'opacity-100',
        visible === false && 'opacity-0',
        'transition-opacity',
        className
      )}
      role="toolbar"
      aria-label="Actions"
    >
      {visibleActions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          className={clsx(
            'rounded transition-colors',
            sizeClasses.button,
            action.danger
              ? 'hover:bg-red-500/10 text-red-400 hover:text-red-300'
              : 'hover:bg-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            action.disabled && 'opacity-50 cursor-not-allowed'
          )}
          title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label}
          aria-label={action.label}
        >
          <span className={sizeClasses.icon}>{action.icon}</span>
        </button>
      ))}
    </div>
  );
}

export const ActionToolbar = memo(ActionToolbarComponent);
