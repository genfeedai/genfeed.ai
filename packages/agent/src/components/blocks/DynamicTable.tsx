'use client';

import { CardEmptySize } from '@genfeedai/contracts';
import type {
  TableBlock,
  TableColumnConfig,
} from '@genfeedai/contracts/interfaces';
import { keyListItems } from '@genfeedai/helpers/ui/list/key-list-items';
import { EmptyState } from '@ui/primitives/empty-state';
import { Skeleton } from '@ui/primitives/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import { type ReactElement, useEffect, useMemo, useState } from 'react';

interface DynamicTableProps {
  block: TableBlock;
}

type HydratableTableBlock = TableBlock & {
  hydration?: {
    status?: 'idle' | 'loading' | 'ready';
  };
};

type SortDirection = 'asc' | 'desc';

interface SortState {
  column: string;
  direction: SortDirection;
}

function sortRows(
  rows: Record<string, unknown>[],
  sort: SortState | null,
): Record<string, unknown>[] {
  if (!sort) return rows;

  return rows.toSorted((a, b) => {
    const aVal = a[sort.column];
    const bVal = b[sort.column];

    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    const multiplier = sort.direction === 'asc' ? 1 : -1;

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * multiplier;
    }

    return String(aVal).localeCompare(String(bVal)) * multiplier;
  });
}

function DynamicTable({ block }: DynamicTableProps): ReactElement {
  const { columns, rows, sortBy, sortDirection } = block;
  const hydratableBlock = block as HydratableTableBlock;
  const isLoading = hydratableBlock.hydration?.status === 'loading';
  const [hasBeenViewed, setHasBeenViewed] = useState(false);

  const [sort, setSort] = useState<SortState | null>(
    sortBy ? { column: sortBy, direction: sortDirection ?? 'asc' } : null,
  );

  useEffect(() => {
    setHasBeenViewed(true);
  }, []);

  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort]);

  function handleHeaderClick(column: TableColumnConfig): void {
    if (!column.sortable) return;

    setSort((prev) => {
      if (prev?.column === column.key) {
        return {
          column: column.key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return { column: column.key, direction: 'asc' };
    });
  }

  return (
    <div
      className="overflow-x-auto border border-border"
      data-work-object-viewed={hasBeenViewed ? 'true' : 'false'}
    >
      <Table size="md">
        <TableHeader>
          <TableRow className="bg-muted/50">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                align={col.align}
                isSortable={col.sortable}
                onClick={() => handleHeaderClick(col)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable && sort?.column === col.key && (
                    <span className="text-foreground">
                      {sort.direction === 'asc' ? '\u2191' : '\u2193'}
                    </span>
                  )}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, rowIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Fixed layout slots have positional identity and no item state.
              <TableRow key={`table-loading-${rowIndex}`}>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    <Skeleton
                      aria-hidden="true"
                      className="h-4"
                      style={{
                        animationDelay: `${rowIndex * 70}ms`,
                        width: `${55 + ((rowIndex + col.key.length) % 4) * 10}%`,
                      }}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : sortedRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length}>
                <EmptyState size={CardEmptySize.SM} title="No data available" />
              </TableCell>
            </TableRow>
          ) : (
            keyListItems(sortedRows, (row) => JSON.stringify(row)).map(
              ({ item: row, key }) => (
                <TableRow key={key}>
                  {columns.map((col) => (
                    <TableCell key={col.key} align={col.align}>
                      {row[col.key] != null ? String(row[col.key]) : '\u2014'}
                    </TableCell>
                  ))}
                </TableRow>
              ),
            )
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default DynamicTable;
