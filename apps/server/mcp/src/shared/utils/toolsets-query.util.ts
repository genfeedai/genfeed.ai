import type { Request } from 'express';

/**
 * Express parses a repeated query param (`?toolsets=a&toolsets=b`) as a
 * string array; a single occurrence (`?toolsets=a,b`) is a plain string. A
 * bracketed form (`?toolsets[x]=y`) parses to a nested `ParsedQs` object,
 * which is not a shape `parseToolsetSelection` understands — it is dropped
 * rather than forwarded as `unknown`.
 */
export function readToolsetsQueryParam(
  query: Request['query'],
): string | string[] | undefined {
  const raw = query.toolsets;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === 'string');
  }
  return undefined;
}

/**
 * True when `?toolsets=` carries at least one non-empty name. An absent or
 * blank param is not an explicit selection, so the profile (default on the
 * bare URL) applies instead. A present `?toolsets=` wins over `?profile=`.
 */
export function hasExplicitToolsetsQuery(
  raw: string | readonly string[] | undefined,
): boolean {
  const values: readonly string[] =
    raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  return values.some((value) =>
    value.split(',').some((segment) => segment.trim().length > 0),
  );
}

/**
 * `?profile=` as one normalized name. A repeated param that disagrees with
 * itself is returned joined, which is not a known profile and fails closed.
 * Bracketed object shapes are dropped, same as `?toolsets=`.
 */
export function readProfileQueryParam(
  query: Request['query'],
): string | undefined {
  const raw = query.profile;
  const strings =
    typeof raw === 'string'
      ? [raw]
      : Array.isArray(raw)
        ? raw.filter((value): value is string => typeof value === 'string')
        : [];
  const normalized = [
    ...new Set(
      strings
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0),
    ),
  ];
  if (normalized.length === 0) return undefined;
  if (normalized.length === 1) return normalized[0];
  return normalized.join(',');
}
