'use client';

import { EMPTY_STATES } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { TableProps } from '@genfeedai/props/ui/display/table.props';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import { SkeletonTable } from '@ui/display/skeleton/skeleton';
import { Button } from '@ui/primitives/button';
import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { useCallback, useRef } from 'react';

const EMPTY_ARRAY: never[] = [];

const Checkbox = dynamic(
  () => import('@ui/primitives/checkbox').then((mod) => mod.Checkbox),
  { ssr: false },
);

export default function AppTable<T>({
  items = EMPTY_ARRAY,
  isLoading = false,
  columns,
  actions = EMPTY_ARRAY,

  getRowKey,
  getRowClassName,
  emptyLabel = EMPTY_STATES.DEFAULT,
  emptyState,

  selectable = false,
  selectedIds = EMPTY_ARRAY,
  onSelectionChange,
  getItemId,
  onRowClick,
  hideHeader = false,
}: TableProps<T>) {
  // Ref for callback to prevent re-renders
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  const handleSelectAll = useCallback(() => {
    if (!onSelectionChangeRef.current || !getItemId) {
      return;
    }

    const allIds = items.map((item) => getItemId(item));
    const allSelected = allIds.every((id) => selectedIds.includes(id));

    if (allSelected) {
      // Deselect all
      onSelectionChangeRef.current([]);
    } else {
      // Select all
      onSelectionChangeRef.current(allIds);
    }
  }, [getItemId, items, selectedIds]);

  const handleSelectItem = useCallback(
    (item: T) => {
      if (!onSelectionChangeRef.current || !getItemId) {
        return;
      }

      const itemId = getItemId(item);
      const isSelected = selectedIds.includes(itemId);

      if (isSelected) {
        onSelectionChangeRef.current(selectedIds.filter((id) => id !== itemId));
      } else {
        onSelectionChangeRef.current([...selectedIds, itemId]);
      }
    },
    [getItemId, selectedIds],
  );

  const handleRowClick = useCallback(
    (item: T, event: React.MouseEvent<HTMLTableRowElement>) => {
      if (!onRowClick) {
        return;
      }

      const target = event.target as HTMLElement;
      if (
        target.closest('button') ||
        target.closest('input[type="checkbox"]') ||
        target.closest('.join')
      ) {
        return;
      }

      onRowClick(item);
    },
    [onRowClick],
  );

  const handleActionClick = useCallback(
    (action: (typeof actions)[number], item: T) => {
      action.onClick?.(item);
    },
    [],
  );

  if (isLoading) {
    return (
      <SkeletonTable
        rows={Math.max(items?.length ?? 0, 6)}
        columns={columns.length}
      />
    );
  }

  if (items?.length === 0) {
    if (emptyState) {
      return <>{emptyState}</>;
    }
    return (
      <div className="rounded bg-card shadow-border">
        <CardEmptyContent label={emptyLabel} />
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded bg-card shadow-border">
      <div className="overflow-x-auto rounded">
        <table className="w-full caption-bottom">
          <thead
            className={cn(
              'sticky top-0 z-10 bg-card/95 backdrop-blur-lg',
              hideHeader && 'sr-only',
            )}
          >
            <tr className="border-b border-border transition-colors">
              {selectable && (
                <th className="size-12 px-4 text-left align-middle font-medium text-muted-foreground">
                  <Checkbox
                    name="selectAll"
                    isChecked={
                      items.length > 0 &&
                      items.every((item) =>
                        getItemId
                          ? selectedIds.includes(getItemId(item))
                          : false,
                      )
                    }
                    onChange={handleSelectAll}
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  className={cn(
                    'h-12 select-none px-4 text-left align-middle font-semibold uppercase text-[10px] tracking-[0.18em] text-foreground/28',
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}

              {actions.length > 0 && (
                <th
                  aria-label="Actions"
                  className="h-12 px-4 text-right align-middle font-medium text-muted-foreground"
                ></th>
              )}
            </tr>
          </thead>

          <tbody className="[&_tr:last-child]:border-0">
            {items.map((item: T, index: number) => {
              const itemId = getItemId ? getItemId(item) : '';
              const isSelected = selectedIds.includes(itemId);

              return (
                <tr
                  key={getRowKey ? getRowKey(item, index) : index}
                  className={cn(
                    'group border-b border-border transition-colors duration-200 odd:bg-background-secondary/50 hover:bg-accent/60',
                    isSelected && 'bg-accent',
                    onRowClick && 'cursor-pointer',
                    getRowClassName?.(item),
                  )}
                  onClick={(event) => handleRowClick(item, event)}
                >
                  {selectable && (
                    <td className="p-4 w-12 align-middle">
                      <Checkbox
                        name={`select-${getItemId ? getItemId(item) : index}`}
                        isChecked={isSelected}
                        onChange={() => handleSelectItem(item)}
                      />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td
                      key={String(column.key)}
                      className={cn(
                        'px-4 py-3 align-middle text-foreground/80',
                        column.className,
                      )}
                    >
                      {column.render
                        ? column.render(item)
                        : String(item[column.key as keyof T])}
                    </td>
                  ))}

                  {actions.length > 0 && (
                    <td className="px-4 py-2 relative align-middle">
                      <div className="flex translate-x-0 justify-end opacity-100 transition-[opacity,transform] duration-200 group-focus-within:translate-x-0 group-focus-within:opacity-100 lg:translate-x-2 lg:opacity-0 lg:group-hover:translate-x-0 lg:group-hover:opacity-100">
                        <div className="flex items-center gap-1">
                          {actions.reduce<ReactNode[]>(
                            (acc, action, actionIndex) => {
                              // Check if action should be visible for this item
                              const isVisible = action.isVisible
                                ? action.isVisible(item)
                                : true;
                              if (!isVisible) {
                                return acc;
                              }
                              const iconContent =
                                typeof action.icon === 'function'
                                  ? action.icon(item)
                                  : action.icon;
                              const tooltipText =
                                typeof action.tooltip === 'function'
                                  ? action.tooltip(item)
                                  : action.tooltip;

                              acc.push(
                                <Button
                                  key={actionIndex}
                                  label={iconContent}
                                  onClick={() =>
                                    handleActionClick(action, item)
                                  }
                                  isDisabled={action.isDisabled?.(item)}
                                  tooltip={tooltipText}
                                  tooltipPosition={
                                    action.tooltipPosition || 'left'
                                  }
                                  data-testid="action-button"
                                  variant={ButtonVariant.GHOST}
                                  size={ButtonSize.SM}
                                  className={cn(
                                    'min-h-11 min-w-11 lg:min-h-0 lg:min-w-0',
                                    action.className,
                                    action.getClassName?.(item),
                                  )}
                                />,
                              );
                              return acc;
                            },
                            [],
                          )}
                        </div>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
