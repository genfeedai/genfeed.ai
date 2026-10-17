import { isRecord } from '@genfeedai/utils/data/extract.util';

const MAX_ROWS_SCANNED = 100;

function brandIdOf(row: Record<string, unknown>): string | undefined {
  return typeof row.brandId === 'string' && row.brandId
    ? row.brandId
    : undefined;
}

/** Rows that can carry a `brandId`: the payload itself and the records in its lists. */
function rowsOf(data: Record<string, unknown>): Record<string, unknown>[] {
  const lists = Object.values(data)
    .filter(Array.isArray)
    .flatMap((list) => list.slice(0, MAX_ROWS_SCANNED).filter(isRecord));
  return [data, ...lists];
}

/** Brand ids a tool result refers to, so their names can be looked up once. */
export function collectBrandIds(data: unknown): string[] {
  if (!isRecord(data)) return [];
  return [
    ...new Set(
      rowsOf(data).flatMap((row) => {
        const id = brandIdOf(row);
        return id ? [id] : [];
      }),
    ),
  ];
}

/**
 * Puts `brandName` next to every `brandId` it can resolve (#7138). The id stays
 * for follow-up calls; the name tells a person which brand the result is for.
 */
export function withBrandNames<T>(
  data: T,
  namesById: ReadonlyMap<string, string>,
): T {
  if (!isRecord(data) || namesById.size === 0) return data;
  const named = (row: Record<string, unknown>): Record<string, unknown> => {
    const id = brandIdOf(row);
    const name = id ? namesById.get(id) : undefined;
    return name && row.brandName === undefined
      ? { ...row, brandName: name }
      : row;
  };
  return Object.fromEntries(
    Object.entries(named(data)).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? value.map((item) => (isRecord(item) ? named(item) : item))
        : value,
    ]),
  ) as T;
}
