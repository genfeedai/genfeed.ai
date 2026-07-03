import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';

interface FindFirstDelegate<TArgs, TResult> {
  findFirst(args: TArgs): Promise<TResult | null>;
}

interface FindUniqueDelegate<TArgs, TResult> {
  findUnique(args: TArgs): Promise<TResult | null>;
}

/**
 * Run `delegate.findFirst(args)` and throw the canonical JSON:API
 * {@link NotFoundException} when no record matches.
 *
 * This is the single implementation of the "find or 404" guard that was
 * previously hand-rolled per call site. Callers own the `where` clause —
 * including `isDeleted: false` and `organizationId` scoping — so the query
 * semantics of each migrated call site are unchanged; only the null-check
 * and exception construction are shared.
 */
export async function findOrThrow<TArgs, TResult>(
  delegate: FindFirstDelegate<TArgs, TResult>,
  args: TArgs,
  resource: string,
  identifier?: string,
): Promise<TResult> {
  const record = await delegate.findFirst(args);
  if (record === null || record === undefined) {
    throw new NotFoundException(resource, identifier);
  }
  return record;
}

/**
 * `findUnique` variant of {@link findOrThrow} for unique-key lookups.
 */
export async function findUniqueOrThrow<TArgs, TResult>(
  delegate: FindUniqueDelegate<TArgs, TResult>,
  args: TArgs,
  resource: string,
  identifier?: string,
): Promise<TResult> {
  const record = await delegate.findUnique(args);
  if (record === null || record === undefined) {
    throw new NotFoundException(resource, identifier);
  }
  return record;
}
