'use client';

import type { KeyValuePair, RowHelpers } from '@genfeedai/types';
import { clsx } from 'clsx';
import { nanoid } from 'nanoid';
import { memo, useCallback } from 'react';
import { DynamicList } from '@/components/input-group/DynamicList';

interface KeyValueListProps {
  items: KeyValuePair[];
  onChange: (items: KeyValuePair[]) => void;
  disabled?: boolean;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addButtonLabel?: string;
  minItems?: number;
  maxItems?: number;
  className?: string;
}

function KeyValueListComponent({
  items,
  onChange,
  disabled = false,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  addButtonLabel = 'Add variable',
  minItems = 0,
  maxItems = 50,
  className,
}: KeyValueListProps) {
  const defaultItem: KeyValuePair = {
    id: '',
    key: '',
    value: '',
  };

  const renderRow = useCallback(
    (item: KeyValuePair, _index: number, helpers: RowHelpers<KeyValuePair>) => (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={item.key}
          onChange={(e) => helpers.update({ key: e.target.value })}
          placeholder={keyPlaceholder}
          disabled={disabled}
          className={clsx(
            'flex-1 px-2 py-1.5 text-sm font-mono',
            'bg-[var(--background)] border border-[var(--border)] rounded',
            'focus:outline-none focus:ring-1 focus:ring-[var(--primary)] focus:border-[var(--primary)]',
            'placeholder:text-[var(--muted-foreground)]',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />
        <span className="text-[var(--muted-foreground)] text-sm">=</span>
        <input
          type="text"
          value={item.value}
          onChange={(e) => helpers.update({ value: e.target.value })}
          placeholder={valuePlaceholder}
          disabled={disabled}
          className={clsx(
            'flex-1 px-2 py-1.5 text-sm',
            'bg-[var(--background)] border border-[var(--border)] rounded',
            'focus:outline-none focus:ring-1 focus:ring-[var(--primary)] focus:border-[var(--primary)]',
            'placeholder:text-[var(--muted-foreground)]',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />
      </div>
    ),
    [keyPlaceholder, valuePlaceholder, disabled]
  );

  const handleChange = useCallback(
    (newItems: KeyValuePair[]) => {
      // Ensure each item has an id
      const itemsWithIds = newItems.map((item) => ({
        ...item,
        id: item.id || nanoid(),
      }));
      onChange(itemsWithIds);
    },
    [onChange]
  );

  return (
    <div className={clsx(disabled && 'opacity-50 pointer-events-none', className)}>
      <DynamicList
        items={items}
        defaultItem={defaultItem}
        onChange={handleChange}
        renderRow={renderRow}
        addButtonLabel={addButtonLabel}
        emptyMessage="No variables defined"
        minItems={minItems}
        maxItems={maxItems}
      />
    </div>
  );
}

export const KeyValueList = memo(KeyValueListComponent);
