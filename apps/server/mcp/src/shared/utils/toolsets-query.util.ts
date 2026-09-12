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
