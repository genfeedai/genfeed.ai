'use client';

import { ContextSidebarPanel } from '@contexts/ui/context-sidebar-context';
import { ButtonVariant } from '@genfeedai/contracts';
import { EMPTY_STATES } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  TableColumn,
  TableProps,
  TableRowLink,
  TableSortDirection,
} from '@genfeedai/props/ui/display/table.props';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import { SkeletonTable } from '@ui/display/skeleton/skeleton';
import { TableRowActionsCell } from '@ui/display/table/TableRowActionsCell';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import { Button } from '@ui/primitives/button';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import { hasSortableValues, sortItemsByColumn } from './table-sort';

const EMPTY_ARRAY: never[] = [];

const Checkbox = dynamic(
  () => import('@ui/primitives/checkbox').then((mod) => mod.Checkbox),
  { ssr: false },
);

function TableSectionHeading({ label }: { label?: string }) {
  if (!label) {
    return null;
  }

  return (
    <div className="mb-3">
      {label ? (
        <h2 className="truncate text-sm font-semibold text-foreground">
          {label}
        </h2>
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
  nameLink,
}: {
  column: TableColumn<T>;
  item: T;
  /** Turns the primary content into the link to the row's detail page. */
  nameLink?: TableRowLink;
}) {
  const content = column.render
    ? column.render(item)
    : String(item[column.key as keyof T]);
  const primary = nameLink ? (
    <Link
      aria-label={nameLink.label}
      className="no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={nameLink.href}
    >
      {content}
    </Link>
  ) : (
    content
  );
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
  items: incomingItems = EMPTY_ARRAY,
  isLoading = false,
  error,
  columns,
  actions = EMPTY_ARRAY,
  renderRowActions,
  framed = true,
  density = 'comfortable',
  enableDragScroll = false,

  getRowKey,
  getRowClassName,
  label,
  ariaLabel,
  scrollAriaLabel,
  emptyLabel = EMPTY_STATES.DEFAULT,
  emptyState,

  selectable = false,
  selectedIds = EMPTY_ARRAY,
  onSelectionChange,
  getItemId,
  getRowLink,
  rowSidebar,
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
  const hasRowActions = actions.length > 0 || renderRowActions !== undefined;
  const scrollRegionLabel =
    scrollAriaLabel?.trim() || ariaLabel?.trim() || label?.trim();
  const hasPinnedHeader = isHeaderPinned && !enableDragScroll;
  const dragPointerId = useRef<number | null>(null);
  const dragStartX = useRef(0);
  const dragStartScrollLeft = useRef(0);
  const didDrag = useRef(false);
  // A reload (sort, filter, page) keeps the rows on screen until the new ones
  // arrive. Swapping the table for its skeleton would unmount the row sidebar
  // and make the page jump; the skeleton is for the first load only.
  const settledItemsRef = useRef<T[]>(incomingItems);
  if (!isLoading || incomingItems.length > 0) {
    settledItemsRef.current = incomingItems;
  }
  const items = settledItemsRef.current;
  const isRefreshing = isLoading && items.length > 0;
  const [sidebarRowId, setSidebarRowId] = useState<string | null>(null);
  // The open record stays open when a reload moves it off the visible rows.
  const sidebarItemRef = useRef<T | null>(null);
  const visibleSidebarItem =
    rowSidebar && sidebarRowId !== null
      ? (items.find((item) => rowSidebar.getId(item) === sidebarRowId) ?? null)
      : null;
  if (visibleSidebarItem !== null || sidebarRowId === null) {
    sidebarItemRef.current = visibleSidebarItem;
  }
  const sidebarItem =
    rowSidebar &&
    sidebarRowId !== null &&
    sidebarItemRef.current !== null &&
    rowSidebar.getId(sidebarItemRef.current) === sidebarRowId
      ? sidebarItemRef.current
      : null;
  const onActivateRow = rowSidebar
    ? (item: T) => setSidebarRowId(rowSidebar.getId(item))
    : onRowClick;

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
      if (!onActivateRow || isInteractiveTarget(event.target)) {
        return;
      }

      onActivateRow(item);
    },
    [isInteractiveTarget, onActivateRow],
  );

  const handleRowKeyDown = useCallback(
    (item: T, event: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (!onActivateRow) {
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      if (isInteractiveTarget(event.target)) {
        return;
      }

      event.preventDefault();
      onActivateRow(item);
    },
    [isInteractiveTarget, onActivateRow],
  );

  const handleActionClick = useCallback(
    (action: (typeof actions)[number], item: T) => {
      action.onClick?.(item);
    },
    [],
  );

  // Without `onSortChange` the table owns the sort and orders the rows it was
  // given. With it the parent sorts (server-side paging) and the table only
  // reports clicks.
  const isSortControlled = onSortChange !== undefined;
  const [localSort, setLocalSort] = useState<{
    key: string;
    direction: TableSortDirection;
  } | null>(null);
  // Grouped tables are ordered by their group; hidden headers have no control.
  const canSort = !hideHeader && (isSortControlled || !getGroupHeading);
  const activeSortKey = isSortControlled ? sortKey : localSort?.key;
  const activeSortDirection = isSortControlled
    ? sortDirection
    : (localSort?.direction ?? 'asc');

  const getSortLabel = useCallback(
    (column: TableColumn<T>): string | undefined =>
      column.sortLabel ??
      (typeof column.header === 'string' ? column.header : undefined),
    [],
  );

  const isColumnSortable = useCallback(
    (column: TableColumn<T>): boolean => {
      if (!canSort || getSortLabel(column) === undefined) {
        return false;
      }
      if (isSortControlled) {
        return column.sortable === true;
      }
      return column.sortable !== false && hasSortableValues(column, items);
    },
    [canSort, getSortLabel, isSortControlled, items],
  );

  const sortedItems = useMemo(() => {
    const column = isSortControlled
      ? undefined
      : columns.find((candidate) => String(candidate.key) === localSort?.key);
    return column && localSort
      ? sortItemsByColumn(items, column, localSort.direction)
      : items;
  }, [columns, isSortControlled, items, localSort]);

  const handleSort = useCallback(
    (key: string) => {
      if (onSortChange) {
        onSortChange(
          key,
          sortKey === key && sortDirection === 'asc' ? 'desc' : 'asc',
        );
        return;
      }

      // asc, then desc, then back to the order the rows arrived in.
      setLocalSort((current) =>
        current?.key !== key
          ? { direction: 'asc', key }
          : current.direction === 'asc'
            ? { direction: 'desc', key }
            : null,
      );
    },
    [onSortChange, sortDirection, sortKey],
  );

  if (isLoading && !isRefreshing) {
    // Shared list loading contract: table skeleton in the same card chrome as
    // empty/list so height does not clip when the fetch settles.
    // SkeletonTable already owns the card shell — do not wrap it again.
    return (
      <TableSectionWrapper label={label}>
        <TableSectionHeading label={label} />
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
        <TableSectionHeading label={label} />
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
        <TableSectionHeading label={label} />
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
              className="min-h-[12rem] w-full"
            />
          )}
        </div>
      </TableSectionWrapper>
    );
  }

  return (
    <TableSectionWrapper label={label}>
      <TableSectionHeading label={label} />
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
                'aria-label': scrollRegionLabel,
                role: scrollRegionLabel ? 'region' : undefined,
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
            aria-busy={isRefreshing || undefined}
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
                  : 'top-0 z-10 bg-card/60',
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
                  const isColumnSortableNow = isColumnSortable(column);
                  const isActiveSort = activeSortKey === columnKey;
                  const SortIcon = isActiveSort
                    ? activeSortDirection === 'asc'
                      ? ArrowUp
                      : ArrowDown
                    : ChevronsUpDown;

                  return (
                    <th
                      key={columnKey}
                      aria-sort={
                        isColumnSortableNow && isActiveSort
                          ? activeSortDirection === 'asc'
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
                      {isColumnSortableNow ? (
                        <Button
                          ariaLabel={column.sortLabel}
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

                {hasRowActions && (
                  <th aria-label="Actions" className="w-0 p-0" />
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {sortedItems.map((item: T, index: number) => {
                const itemId = getItemId ? getItemId(item) : '';
                const isSelected = selectedIds.includes(itemId);
                const rowLink = getRowLink?.(item);
                // With a sidebar the link moves onto the name; the row opens
                // the sidebar. Without one the whole row is the link.
                const coverLink = rowSidebar ? undefined : rowLink;
                const nameLink = rowSidebar ? rowLink : undefined;
                const isSidebarRow =
                  rowSidebar !== undefined &&
                  sidebarRowId === rowSidebar.getId(item);
                const rowKey = getRowKey ? getRowKey(item, index) : index;
                const expandedContent = renderExpandedRow?.(item);
                const groupHeading = getGroupHeading?.(item) ?? null;
                const previousGroupHeading =
                  index > 0
                    ? (getGroupHeading?.(sortedItems[index - 1]) ?? null)
                    : null;
                const showsGroupHeading =
                  groupHeading !== null &&
                  groupHeading.key !== previousGroupHeading?.key;
                const columnCount =
                  columns.length +
                  (selectable ? 1 : 0) +
                  (hasRowActions ? 1 : 0);

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
                        'group transition-colors duration-200 odd:bg-card/50 hover:bg-accent/60',
                        (isSelected || isSidebarRow) && 'bg-accent',
                        // A linked row positions the overlay anchor below; the
                        // click affordance comes from the anchor, not the row.
                        coverLink && 'relative cursor-pointer',
                        !coverLink &&
                          onActivateRow &&
                          'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                        getRowClassName?.(item),
                      )}
                      onClick={
                        coverLink
                          ? undefined
                          : (event) => handleRowClick(item, event)
                      }
                      onKeyDown={
                        !coverLink && onActivateRow
                          ? (event) => handleRowKeyDown(item, event)
                          : undefined
                      }
                      tabIndex={!coverLink && onActivateRow ? 0 : undefined}
                    >
                      {selectable && (
                        <td
                          className={cn(
                            // z-10 lifts the checkbox above a row-link anchor,
                            // which comes later in the DOM and would otherwise
                            // paint over it and turn "select" into "navigate".
                            'relative z-10 align-middle',
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
                          {coverLink && columnIndex === 0 ? (
                            <>
                              {/* The anchor covers the whole row (the `tr` is the
                              positioned ancestor), so ordinary cells must stay
                              unpositioned — anything painted above it swallows
                              the click, and a linked row has no `onClick`
                              fallback. Only the checkbox and action cells are
                              raised, and they are positioned on their own `td`. */}
                              <Link
                                aria-label={coverLink.label}
                                className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                href={coverLink.href}
                              />
                              <TableCellContent column={column} item={item} />
                            </>
                          ) : (
                            <TableCellContent
                              column={column}
                              item={item}
                              nameLink={
                                columnIndex === 0 ? nameLink : undefined
                              }
                            />
                          )}
                        </td>
                      ))}

                      {hasRowActions && (
                        <TableRowActionsCell
                          actions={actions}
                          item={item}
                          renderRowActions={renderRowActions}
                          onActionClick={handleActionClick}
                        />
                      )}
                    </tr>
                    {expandedContent === undefined ? null : (
                      <tr className="bg-card/50">
                        <td
                          className="px-4 pb-4 align-top"
                          colSpan={
                            columns.length +
                            (selectable ? 1 : 0) +
                            (hasRowActions ? 1 : 0)
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
      {rowSidebar ? (
        <ContextSidebarPanel
          onClose={() => setSidebarRowId(null)}
          selection={
            sidebarItem
              ? {
                  id: rowSidebar.getId(sidebarItem),
                  kind: rowSidebar.kind,
                  origin: 'user',
                  subtitle: rowSidebar.getSubtitle?.(sidebarItem),
                  title: rowSidebar.getTitle(sidebarItem),
                }
              : null
          }
        >
          {sidebarItem ? rowSidebar.render(sidebarItem) : null}
        </ContextSidebarPanel>
      ) : null}
    </TableSectionWrapper>
  );
}
