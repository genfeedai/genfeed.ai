'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { EMPTY_STATES } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { keyListItems } from '@genfeedai/helpers/ui/list/key-list-items';
import type {
  TableColumn,
  TableProps,
} from '@genfeedai/props/ui/display/table.props';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import { SkeletonTable } from '@ui/display/skeleton/skeleton';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import { Button } from '@ui/primitives/button';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Fragment, useCallback, useRef } from 'react';

const EMPTY_ARRAY: never[] = [];

const Checkbox = dynamic(
  () => import('@ui/primitives/checkbox').then((mod) => mod.Checkbox),
  { ssr: false },
);

function TableSectionHeading({
  label,
  description,
}: {
  label?: string;
  description?: string;
}) {
  if (!label && !description) {
    return null;
  }

  return (
    <div className="mb-3">
      {label ? (
        <h3 className="truncate text-sm font-semibold text-foreground">
          {label}
        </h3>
      ) : null}
      {description ? (
        <p className="text-xs text-foreground/55">{description}</p>
      ) : null}
    </div>
  );
}

function TableSectionWrapper({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  if (label) {
    return <section>{children}</section>;
  }

  return <>{children}</>;
}

function TableCellContent<T>({
  column,
  item,
}: {
  column: TableColumn<T>;
  item: T;
}) {
  const primary = column.render
    ? column.render(item)
    : String(item[column.key as keyof T]);
  const subtext = column.subtext?.(item);
  const hasSubtext =
    subtext !== null &&
    subtext !== undefined &&
    (typeof subtext !== 'string' || subtext.trim().length > 0);

  if (!hasSubtext) {
    return primary;
  }

  return (
    <div className="min-w-0">
      <div className="min-w-0 truncate text-sm font-medium text-foreground">
        {primary}
      </div>
      <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
        {subtext}
      </div>
    </div>
  );
}

export default function AppTable<T>({
  items = EMPTY_ARRAY,
  isLoading = false,
  error,
  columns,
  actions = EMPTY_ARRAY,
  framed = true,
  density = 'comfortable',
  enableDragScroll = false,

  getRowKey,
  getRowClassName,
  label,
  ariaLabel,
  description,
  emptyLabel = EMPTY_STATES.DEFAULT,
  emptyDescription,
  emptyState,

  selectable = false,
  selectedIds = EMPTY_ARRAY,
  onSelectionChange,
  getItemId,
  getRowLink,
  onRowClick,
  renderExpandedRow,
  hideHeader = false,
  isHeaderPinned = false,
  getGroupHeading,
  sortKey,
  sortDirection = 'asc',
  onSortChange,
}: TableProps<T>) {
  const isCompact = density === 'compact';
  const hasPinnedHeader = isHeaderPinned && !enableDragScroll;
  const dragPointerId = useRef<number | null>(null);
  const dragStartX = useRef(0);
  const dragStartScrollLeft = useRef(0);
  const didDrag = useRef(false);

  const handleScrollPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    didDrag.current = false;
    const viewport = event.currentTarget;
    if (
      event.pointerType !== 'mouse' ||
      event.button !== 0 ||
      viewport.scrollWidth <= viewport.clientWidth ||
      !(event.target instanceof Element) ||
      event.target.closest(
        'button, a, input, textarea, select, [role="checkbox"], [role="combobox"], [contenteditable="true"], [draggable="true"]',
      )
    )
      return;
    dragPointerId.current = event.pointerId;
    dragStartX.current = event.clientX;
    dragStartScrollLeft.current = viewport.scrollLeft;
  };

  const handleScrollPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (dragPointerId.current !== event.pointerId) return;
    const distance = event.clientX - dragStartX.current;
    if (!didDrag.current && Math.abs(distance) < 6) return;
    if (!didDrag.current) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    didDrag.current = true;
    event.currentTarget.dataset.dragging = 'true';
    event.currentTarget.scrollLeft = dragStartScrollLeft.current - distance;
    event.preventDefault();
  };

  const handleScrollPointerEnd = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (dragPointerId.current !== event.pointerId) return;
    dragPointerId.current = null;
    delete event.currentTarget.dataset.dragging;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

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

  const isInteractiveTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    return Boolean(
      target.closest('button') ||
        target.closest('a') ||
        target.closest('input') ||
        target.closest('textarea') ||
        target.closest('select') ||
        target.closest('[role="checkbox"]') ||
        target.closest('.join'),
    );
  }, []);

  const handleRowClick = useCallback(
    (item: T, event: React.MouseEvent<HTMLTableRowElement>) => {
      if (!onRowClick || isInteractiveTarget(event.target)) {
        return;
      }

      onRowClick(item);
    },
    [isInteractiveTarget, onRowClick],
  );

  const handleRowKeyDown = useCallback(
    (item: T, event: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (!onRowClick) {
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      if (isInteractiveTarget(event.target)) {
        return;
      }

      event.preventDefault();
      onRowClick(item);
    },
    [isInteractiveTarget, onRowClick],
  );

  const handleActionClick = useCallback(
    (action: (typeof actions)[number], item: T) => {
      action.onClick?.(item);
    },
    [],
  );

  const handleSort = useCallback(
    (key: string) => {
      if (!onSortChange) {
        return;
      }

      onSortChange(
        key,
        sortKey === key && sortDirection === 'asc' ? 'desc' : 'asc',
      );
    },
    [onSortChange, sortDirection, sortKey],
  );

  if (isLoading) {
    // Shared list loading contract: table skeleton in the same card chrome as
    // empty/list so height does not clip when the fetch settles.
    // SkeletonTable already owns the card shell — do not wrap it again.
    return (
      <TableSectionWrapper label={label}>
        <TableSectionHeading label={label} description={description} />
        <SkeletonTable
          className={framed ? undefined : 'rounded-none border-0 shadow-none'}
          rows={Math.max(items?.length ?? 0, 6)}
          columns={Math.max(columns.length, 1)}
        />
      </TableSectionWrapper>
    );
  }

  if (error && items.length === 0) {
    return (
      <TableSectionWrapper label={label}>
        <TableSectionHeading label={label} description={description} />
        <div
          className={cn(
            'relative w-full overflow-hidden bg-card',
            framed
              ? 'rounded-card border border-border'
              : 'rounded-none border-0 shadow-none',
          )}
        >
          <ErrorFallback
            title={error.title}
            description={error.description}
            resetErrorBoundary={error.onRetry}
          />
        </div>
      </TableSectionWrapper>
    );
  }

  if (items?.length === 0) {
    return (
      <TableSectionWrapper label={label}>
        <TableSectionHeading label={label} description={description} />
        <div
          className={cn(
            'relative w-full overflow-hidden bg-card',
            framed
              ? 'rounded-card border border-border'
              : 'rounded-none border-0 shadow-none',
          )}
          data-testid="table-empty"
        >
          {emptyState ?? (
            <CardEmptyContent
              label={emptyLabel}
              description={emptyDescription}
              className="min-h-[12rem] w-full"
            />
          )}
        </div>
      </TableSectionWrapper>
    );
  }

  return (
    <TableSectionWrapper label={label}>
      <TableSectionHeading label={label} description={description} />
      <div
        className={cn(
          'relative bg-card',
          hasPinnedHeader ? 'overflow-clip' : 'overflow-hidden',
          framed
            ? 'rounded-card border border-border'
            : 'rounded-none border-0 shadow-none',
        )}
      >
        {error ? (
          <ErrorFallback
            compact
            title={error.title}
            description={error.description}
            resetErrorBoundary={error.onRetry}
          />
        ) : null}
        <div
          {...(enableDragScroll
            ? {
                'aria-label': 'Scroll table horizontally',
                role: 'region',
                tabIndex: 0,
              }
            : {})}
          className={cn(
            hasPinnedHeader ? undefined : 'overflow-x-auto',
            enableDragScroll &&
              'data-[dragging=true]:select-none data-[dragging=true]:cursor-grabbing',
          )}
          onPointerDown={enableDragScroll ? handleScrollPointerDown : undefined}
          onPointerMove={enableDragScroll ? handleScrollPointerMove : undefined}
          onPointerUp={enableDragScroll ? handleScrollPointerEnd : undefined}
          onPointerCancel={
            enableDragScroll ? handleScrollPointerEnd : undefined
          }
          onLostPointerCapture={
            enableDragScroll ? handleScrollPointerEnd : undefined
          }
          onClickCapture={
            enableDragScroll
              ? (event) => {
                  if (didDrag.current && event.detail !== 0) {
                    didDrag.current = false;
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }
              : undefined
          }
        >
          <table
            aria-label={ariaLabel}
            className={cn(
              'w-full caption-bottom border-collapse',
              isCompact && 'min-w-[56rem]',
            )}
          >
            <thead
              className={cn(
                'border-b border-border',
                !enableDragScroll && 'sticky',
                hasPinnedHeader
                  ? 'z-20 bg-background'
                  : 'top-0 z-10 bg-background-secondary/60',
                hideHeader && 'sr-only',
              )}
              style={
                hasPinnedHeader
                  ? { top: 'var(--pinned-topbar-height, 0px)' }
                  : undefined
              }
            >
              <tr className="transition-colors">
                {selectable && (
                  <th
                    className={cn(
                      'text-left align-middle font-medium text-muted-foreground',
                      isCompact ? 'w-8 px-2' : 'size-12 px-4',
                    )}
                  >
                    <Checkbox
                      name="selectAll"
                      aria-label="Select all rows"
                      checked={
                        items.length > 0 &&
                        items.every((item) =>
                          getItemId
                            ? selectedIds.includes(getItemId(item))
                            : false,
                        )
                          ? true
                          : items.some(
                                (item) =>
                                  getItemId &&
                                  selectedIds.includes(getItemId(item)),
                              )
                            ? 'indeterminate'
                            : false
                      }
                      onChange={handleSelectAll}
                    />
                  </th>
                )}
                {columns.map((column) => {
                  const columnKey = String(column.key);
                  const isActiveSort = sortKey === columnKey;
                  const SortIcon = isActiveSort
                    ? sortDirection === 'asc'
                      ? ArrowUp
                      : ArrowDown
                    : ChevronsUpDown;

                  return (
                    <th
                      key={columnKey}
                      aria-sort={
                        column.sortable && isActiveSort
                          ? sortDirection === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                      className={cn(
                        'h-10 select-none text-left align-middle text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground',
                        isCompact ? 'px-2' : 'px-4',
                        column.className,
                      )}
                    >
                      {column.sortable && onSortChange ? (
                        <Button
                          ariaLabel={`Sort by ${column.sortLabel ?? String(column.header)}`}
                          className="group -ml-1 inline-flex items-center gap-1 rounded px-1 py-1 text-left text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
                          onClick={() => handleSort(columnKey)}
                          textTransform="none"
                          variant={ButtonVariant.UNSTYLED}
                          withWrapper={false}
                        >
                          {column.header}
                          <SortIcon
                            aria-hidden="true"
                            className={cn(
                              'size-3.5 transition-opacity',
                              isActiveSort
                                ? 'opacity-100'
                                : 'opacity-40 group-hover:opacity-80',
                            )}
                          />
                        </Button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}

                {actions.length > 0 && (
                  <th
                    aria-label="Actions"
                    className={cn(
                      'h-10 text-right align-middle font-medium text-muted-foreground',
                      isCompact ? 'w-24 px-2' : 'px-4',
                    )}
                  ></th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {items.map((item: T, index: number) => {
                const itemId = getItemId ? getItemId(item) : '';
                const isSelected = selectedIds.includes(itemId);
                const rowLink = getRowLink?.(item);
                const rowKey = getRowKey ? getRowKey(item, index) : index;
                const expandedContent = renderExpandedRow?.(item);
                const groupHeading = getGroupHeading?.(item) ?? null;
                const previousGroupHeading =
                  index > 0
                    ? (getGroupHeading?.(items[index - 1]) ?? null)
                    : null;
                const showsGroupHeading =
                  groupHeading !== null &&
                  groupHeading.key !== previousGroupHeading?.key;
                const columnCount =
                  columns.length +
                  (selectable ? 1 : 0) +
                  (actions.length > 0 ? 1 : 0);

                return (
                  <Fragment key={rowKey}>
                    {showsGroupHeading && groupHeading ? (
                      <tr>
                        <td className="p-0" colSpan={columnCount}>
                          {groupHeading.content}
                        </td>
                      </tr>
                    ) : null}
                    <tr
                      className={cn(
                        'group transition-colors duration-200 odd:bg-background-secondary/50 hover:bg-accent/60',
                        isSelected && 'bg-accent',
                        // A linked row positions the overlay anchor below; the
                        // click affordance comes from the anchor, not the row.
                        rowLink && 'relative cursor-pointer',
                        !rowLink &&
                          onRowClick &&
                          'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                        getRowClassName?.(item),
                      )}
                      onClick={
                        rowLink
                          ? undefined
                          : (event) => handleRowClick(item, event)
                      }
                      onKeyDown={
                        !rowLink && onRowClick
                          ? (event) => handleRowKeyDown(item, event)
                          : undefined
                      }
                      tabIndex={!rowLink && onRowClick ? 0 : undefined}
                    >
                      {selectable && (
                        <td
                          className={cn(
                            'relative align-middle',
                            isCompact ? 'w-8 p-2' : 'p-4 w-12',
                          )}
                        >
                          <Checkbox
                            name={`select-${getItemId ? getItemId(item) : index}`}
                            aria-label={`Select row ${index + 1}`}
                            isChecked={isSelected}
                            onChange={() => handleSelectItem(item)}
                          />
                        </td>
                      )}
                      {columns.map((column, columnIndex) => (
                        <td
                          key={String(column.key)}
                          className={cn(
                            'align-middle text-foreground/80',
                            isCompact ? 'px-2 py-2' : 'px-4 py-3',
                            column.className,
                          )}
                        >
                          {rowLink && columnIndex === 0 ? (
                            <>
                              {/* The anchor covers the whole row (the `tr` is the
                              positioned ancestor), so ordinary cells must stay
                              unpositioned — anything painted above it swallows
                              the click, and a linked row has no `onClick`
                              fallback. Only the checkbox and action cells are
                              raised, and they are positioned on their own `td`. */}
                              <Link
                                aria-label={rowLink.label}
                                className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                href={rowLink.href}
                              />
                              <TableCellContent column={column} item={item} />
                            </>
                          ) : (
                            <TableCellContent column={column} item={item} />
                          )}
                        </td>
                      ))}

                      {actions.length > 0 && (
                        <td
                          className={cn(
                            'py-2 relative align-middle',
                            isCompact ? 'px-2' : 'px-4',
                          )}
                        >
                          <div
                            className={cn(
                              'flex translate-x-0 justify-end opacity-100 transition-[opacity,transform] duration-200 group-focus-within:translate-x-0 group-focus-within:opacity-100 lg:opacity-0 lg:group-hover:translate-x-0 lg:group-hover:opacity-100',
                              !isCompact && 'lg:translate-x-2',
                            )}
                          >
                            <div className="flex items-center gap-1">
                              {keyListItems(actions, (action) =>
                                typeof action.tooltip === 'function'
                                  ? action.tooltip(item)
                                  : action.tooltip,
                              ).reduce<ReactNode[]>(
                                (acc, { item: action, key }) => {
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
                                      key={key}
                                      icon={iconContent}
                                      ariaLabel={
                                        typeof tooltipText === 'string'
                                          ? tooltipText
                                          : 'Row action'
                                      }
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
                                      size={ButtonSize.ICON}
                                      className={cn(
                                        // 44px touch target on small screens; compact
                                        // icon control on desktop. Cap glyph size so
                                        // bare lucide icons don't render at 24px.
                                        'inline-flex size-11 items-center justify-center p-0 lg:size-8 [&_svg]:size-3.5',
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
                    {expandedContent === undefined ? null : (
                      <tr className="bg-background-secondary/50">
                        <td
                          className="px-4 pb-4 align-top"
                          colSpan={
                            columns.length +
                            (selectable ? 1 : 0) +
                            (actions.length > 0 ? 1 : 0)
                          }
                        >
                          {expandedContent}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </TableSectionWrapper>
  );
}
