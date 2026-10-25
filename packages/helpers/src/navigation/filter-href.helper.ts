/** Change one filter without discarding other URL state. */
export function createFilterHref(
  pathname: string,
  search: string,
  key: string,
  value: string,
): string {
  const params = new URLSearchParams(search);
  params.set(key, value);
  params.delete('page');
  return `${pathname}?${params.toString()}`;
}

/**
 * Link to a view that is a path segment (`/workspace/inbox/unread`) while
 * keeping the filters in the query. Drops the legacy `viewKey` param the view
 * used to ride in, and `page`, which belongs to the view that is being left.
 */
export function createPathViewHref(
  pathname: string,
  search: string,
  viewKey: string,
): string {
  const params = new URLSearchParams(search);
  params.delete(viewKey);
  params.delete('page');
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
