'use client';

import type { TableBlock, TableColumnConfig } from '@genfeedai/interfaces';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import { type ReactElement, useMemo, useState } from 'react';

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

  return [...rows].sort((a, b) => {
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

function getAlignClass(align?: TableColumnConfig['align']): string {
  switch (align) {
    case 'center':
      return 'text-center';
    case 'right':
      return 'text-right';
    default:
      return 'text-left';
  }
}

function DynamicTable({ block }: DynamicTableProps): ReactElement {
  const { columns, rows, sortBy, sortDirection } = block;
  const hydratableBlock = block as HydratableTableBlock;
  const isLoading = hydratableBlock.hydration?.status === 'loading';

  const [sort, setSort] = useState<SortState | null>(
    sortBy ? { column: sortBy, direction: sortDirection ?? 'asc' } : null,
  );

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
    <div className="overflow-x-auto border border-border">
      <Table className="w-full text-sm">
        <TableHeader>
          <TableRow className="border-b border-border bg-muted/50">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${getAlignClass(col.align)} ${
                  col.sortable
                    ? 'cursor-pointer select-none hover:text-foreground'
                    : ''
                }`}
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
              <TableRow
                key={`table-loading-${rowIndex}`}
                className="border-b border-border"
              >
                {columns.map((col) => (
                  <TableCell
                    key={`${col.key}-${rowIndex}`}
                    className="px-4 py-3"
                  >
                    <div
                      className="h-4 animate-pulse rounded bg-muted/70"
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
              <TableCell
                colSpan={columns.length}
                className="px-4 py-8 text-center text-muted-foreground"
              >
                No data available
              </TableCell>
            </TableRow>
          ) : (
            sortedRows.map((row, rowIndex) => (
              <TableRow
                key={rowIndex}
                className="border-b border-border transition-colors last:border-b-0 hover:bg-accent/30"
              >
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={`px-4 py-2.5 text-foreground ${getAlignClass(col.align)}`}
                  >
                    {row[col.key] != null ? String(row[col.key]) : '\u2014'}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default DynamicTable;
