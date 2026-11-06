import type { QueryClient, QueryFilters } from '@tanstack/react-query';

/**
 * Writes a mutation's result into every cached query matching `filters`.
 *
 * A read already in flight would land after the write and undo it, so it is
 * cancelled first. Cancelling a key with nothing cached yet (a new page or
 * filter still loading behind the previous rows) leaves it idle, so the ones
 * on screen are started again.
 */
export async function updateCachedQueries<TData>(
  queryClient: QueryClient,
  filters: QueryFilters,
  update: (current: TData) => TData,
): Promise<void> {
  await queryClient.cancelQueries(filters);
  queryClient.setQueriesData<TData>(filters, (current) =>
    current === undefined ? current : update(current),
  );
  void queryClient.refetchQueries({
    ...filters,
    predicate: (query) =>
      query.state.data === undefined && (filters.predicate?.(query) ?? true),
    type: 'active',
  });
}
