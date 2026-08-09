export type MenuSearchParamsMatch = Readonly<Record<string, string | null>>;

/**
 * Match only the query parameters that define navigation identity.
 * A null value requires the parameter to be absent; unrelated filters remain
 * opaque so search, pagination, and task context do not clear active state.
 */
export function matchesMenuSearchParams(
  searchParams: URLSearchParams,
  expected?: MenuSearchParamsMatch,
): boolean {
  if (!expected) {
    return true;
  }

  return Object.entries(expected).every(([key, value]) =>
    value === null ? !searchParams.has(key) : searchParams.get(key) === value,
  );
}
