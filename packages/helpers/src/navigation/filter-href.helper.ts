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
