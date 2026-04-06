'use client';

import type { KeyValuePair, RowHelpers } from '@genfeedai/types';
import { Input } from '@ui/primitives/input';
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
        <Input
          type="text"
          value={item.key}
          onChange={(e) => helpers.update({ key: e.target.value })}
          placeholder={keyPlaceholder}
          disabled={disabled}
          className="flex-1 font-mono"
        />
        <span className="text-[var(--muted-foreground)] text-sm">=</span>
        <Input
          type="text"
          value={item.value}
          onChange={(e) => helpers.update({ value: e.target.value })}
          placeholder={valuePlaceholder}
          disabled={disabled}
          className="flex-1"
        />
      </div>
    ),
    [keyPlaceholder, valuePlaceholder, disabled],
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
    [onChange],
  );

  return (
    <div
      className={clsx(disabled && 'opacity-50 pointer-events-none', className)}
    >
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
