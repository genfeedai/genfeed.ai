'use client';

import type { ActionConfig, RowHelpers } from '@genfeedai/types';
import { clsx } from 'clsx';
import { Plus } from 'lucide-react';
import { nanoid } from 'nanoid';
import { memo, type ReactNode, useCallback } from 'react';
import { InputGroupRow } from './InputGroupRow';

interface DynamicListProps<T = Record<string, unknown>> {
  items: T[];
  minItems?: number;
  maxItems?: number;
  sortable?: boolean;
  defaultItem: T;
  onChange: (items: T[]) => void;
  renderRow: (item: T, index: number, helpers: RowHelpers<T>) => ReactNode;
  addButtonLabel?: string;
  emptyMessage?: string;
  actions?: ActionConfig<ReactNode>[];
  className?: string;
}

function DynamicListComponent<
  T extends { id?: string } = Record<string, unknown> & { id?: string },
>({
  items,
  minItems = 0,
  maxItems = Infinity,
  sortable = false,
  defaultItem,
  onChange,
  renderRow,
  addButtonLabel = 'Add item',
  emptyMessage = 'No items yet',
  className,
}: DynamicListProps<T>) {
  const canAdd = items.length < maxItems;
  const canRemove = items.length > minItems;

  const handleAdd = useCallback(() => {
    if (!canAdd) return;
    const newItem = { ...defaultItem, id: nanoid() } as T;
    onChange([...items, newItem]);
  }, [canAdd, defaultItem, items, onChange]);

  const createHelpers = useCallback(
    (index: number): RowHelpers<T> => ({
      duplicate: () => {
        if (!canAdd) return;
        const newItem = { ...items[index], id: nanoid() } as T;
        const newItems = [...items];
        newItems.splice(index + 1, 0, newItem);
        onChange(newItems);
      },
      moveDown: () => {
        if (index === items.length - 1) return;
        const newItems = [...items];
        [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
        onChange(newItems);
      },
      moveUp: () => {
        if (index === 0) return;
        const newItems = [...items];
        [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
        onChange(newItems);
      },
      remove: () => {
        if (!canRemove) return;
        const newItems = items.filter((_, i) => i !== index);
        onChange(newItems);
      },
      update: (data: Partial<T>) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], ...data };
        onChange(newItems);
      },
    }),
    [items, onChange, canRemove, canAdd]
  );

  return (
    <div className={clsx('space-y-1', className)}>
      {/* Items */}
      {items.length === 0 ? (
        <div className="py-4 text-center text-sm text-[var(--muted-foreground)]">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((item, index) => {
            const helpers = createHelpers(index);
            return (
              <InputGroupRow
                key={item.id || index}
                index={index}
                data={item}
                sortable={sortable}
                onChange={(data) => helpers.update(data as Partial<T>)}
                onDelete={canRemove ? helpers.remove : undefined}
                onDuplicate={canAdd ? helpers.duplicate : undefined}
              >
                {renderRow(item, index, helpers)}
              </InputGroupRow>
            );
          })}
        </div>
      )}

      {/* Add Button */}
      {canAdd && (
        <button
          type="button"
          onClick={handleAdd}
          className={clsx(
            'w-full flex items-center justify-center gap-2 py-2 px-3',
            'text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            'border border-dashed border-[var(--border)] hover:border-[var(--primary)]',
            'rounded-lg transition-colors',
            'hover:bg-[var(--card)]/50'
          )}
        >
          <Plus className="w-4 h-4" />
          {addButtonLabel}
        </button>
      )}

      {/* Item Count */}
      {maxItems < Infinity && (
        <p className="text-xs text-[var(--muted-foreground)] text-right">
          {items.length} / {maxItems} items
        </p>
      )}
    </div>
  );
}

export const DynamicList = memo(DynamicListComponent) as typeof DynamicListComponent;
