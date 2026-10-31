import type {
  TableColumn,
  TableSortDirection,
  TableSortValue,
} from '@genfeedai/props/ui/display/table.props';

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function isSortValue(value: unknown): value is Exclude<TableSortValue, null> {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  );
}

/** The value a row is ordered by for a column: `sortValue`, else `item[key]`. */
export function getColumnSortValue<T>(
  column: TableColumn<T>,
  item: T,
): TableSortValue {
  if (column.sortValue) {
    return column.sortValue(item);
  }
  const value = (item as Record<string, unknown>)[String(column.key)];
  return isSortValue(value) ? value : undefined;
}

function toComparable(value: TableSortValue): string | number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return value;
}

/** Empty values always sort last, whichever way the column is ordered. */
function compareSortValues(
  a: TableSortValue,
  b: TableSortValue,
  direction: TableSortDirection,
): number {
  const left = toComparable(a);
  const right = toComparable(b);
  if (left === null || right === null) {
    return left === right ? 0 : left === null ? 1 : -1;
  }
  const order =
    typeof left === 'number' && typeof right === 'number'
      ? left - right
      : collator.compare(String(left), String(right));
  return direction === 'asc' ? order : -order;
}

/** A column can be ordered when at least one row yields a sortable value. */
export function hasSortableValues<T>(
  column: TableColumn<T>,
  items: T[],
): boolean {
  return items.some((item) => {
    const value = getColumnSortValue(column, item);
    return value !== null && value !== undefined;
  });
}

/** Stable sort by one column; the input array is left untouched. */
export function sortItemsByColumn<T>(
  items: T[],
  column: TableColumn<T>,
  direction: TableSortDirection,
): T[] {
  return items
    .map((item, index) => ({ index, item }))
    .sort(
      (a, b) =>
        compareSortValues(
          getColumnSortValue(column, a.item),
          getColumnSortValue(column, b.item),
          direction,
        ) || a.index - b.index,
    )
    .map(({ item }) => item);
}
