import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';
import { vi } from 'vitest';

export type GuardedRow = {
  [field: string]: unknown;
  id: string;
  isDeleted: boolean;
  organizationId: string | null;
};

type Where = Record<string, unknown>;

type GuardedArgs = {
  create?: Where;
  data?: Where;
  update?: Where;
  where?: Where;
};

function isRecord(value: unknown): value is Where {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asList(value: unknown): Where[] {
  return (Array.isArray(value) ? value : [value]).filter(isRecord);
}

function matchesField(actual: unknown, expected: unknown): boolean {
  if (!isRecord(expected)) {
    return actual === expected;
  }
  if (Array.isArray(expected.path)) {
    const value = expected.path.reduce<unknown>(
      (current, segment) =>
        isRecord(current) ? current[String(segment)] : undefined,
      actual,
    );
    if ('gt' in expected) {
      return String(value) > String(expected.gt);
    }
    return value === expected.equals;
  }
  if ('not' in expected) {
    return actual !== expected.not;
  }
  if (Array.isArray(expected.in)) {
    return expected.in.includes(actual);
  }
  if ('has' in expected) {
    return Array.isArray(actual) && actual.includes(expected.has);
  }
  if ('equals' in expected) {
    return actual === expected.equals;
  }
  throw new Error(`Unsupported where operator: ${JSON.stringify(expected)}`);
}

/**
 * Evaluates the subset of Prisma `where` the registry reads use. An operator
 * it does not know throws instead of quietly matching, so a spec can never
 * pass on a filter the fake ignored.
 */
export function matchesWhere(row: GuardedRow, where: Where): boolean {
  return Object.entries(where).every(([field, expected]) => {
    if (expected === undefined) {
      return true;
    }
    if (field === 'AND') {
      return asList(expected).every((arm) => matchesWhere(row, arm));
    }
    if (field === 'OR') {
      return asList(expected).some((arm) => matchesWhere(row, arm));
    }
    if (field === 'NOT') {
      return !asList(expected).some((arm) => matchesWhere(row, arm));
    }
    return matchesField(row[field], expected);
  });
}

/**
 * In-memory Prisma delegate for a tenant model that runs the real CLOUD
 * tenant guard on every call, exactly like the Prisma `$allOperations`
 * extension. Results are lazy like a PrismaPromise: the query (and so the
 * guard) runs when the result is awaited, so a query that escapes a
 * `crossOrgUnsafe` callback un-awaited is rejected here too.
 */
export function buildGuardedDelegate(model: string, rows: GuardedRow[]) {
  const lazy = <T>(
    operation: string,
    args: GuardedArgs | undefined,
    run: () => T,
  ): PromiseLike<T> => ({
    // biome-ignore lint/suspicious/noThenProperty: PrismaPromise executes lazily through its then method.
    then: (onfulfilled, onrejected) =>
      Promise.resolve()
        .then(() => {
          assertTenantScopedQuery({
            args,
            isCloud: true,
            model,
            operation,
            tenantModelNames: new Set([model]),
          });
          return run();
        })
        .then(onfulfilled, onrejected),
  });
  const select = (where: Where | undefined) =>
    rows.filter((row) => matchesWhere(row, where ?? {}));

  return {
    count: vi.fn((args?: GuardedArgs) =>
      lazy('count', args, () => select(args?.where).length),
    ),
    findFirst: vi.fn((args?: GuardedArgs) =>
      lazy('findFirst', args, () => select(args?.where)[0] ?? null),
    ),
    findMany: vi.fn((args?: GuardedArgs) =>
      lazy('findMany', args, () => select(args?.where)),
    ),
    findUnique: vi.fn((args?: GuardedArgs) =>
      lazy('findUnique', args, () => select(args?.where)[0] ?? null),
    ),
    update: vi.fn((args: GuardedArgs) =>
      lazy('update', args, () => {
        const row = select(args.where)[0];
        if (!row) {
          throw Object.assign(new Error('not found'), { code: 'P2025' });
        }
        Object.assign(row, args.data);
        return row;
      }),
    ),
    upsert: vi.fn((args: GuardedArgs) =>
      lazy('upsert', args, () => {
        const existing = select(args.where)[0];
        if (existing) {
          return Object.assign(existing, args.update);
        }
        const created = {
          id: `created-${rows.length}`,
          isDeleted: false,
          organizationId: null,
          ...args.create,
        } as GuardedRow;
        rows.push(created);
        return created;
      }),
    ),
    updateMany: vi.fn((args: GuardedArgs) =>
      lazy('updateMany', args, () => {
        const matched = select(args.where);
        for (const row of matched) {
          Object.assign(row, args.data);
        }
        return { count: matched.length };
      }),
    ),
  };
}

export function idsOf(rows: ReadonlyArray<{ id?: unknown }>): string[] {
  return rows.map((row) => String(row.id)).sort();
}
