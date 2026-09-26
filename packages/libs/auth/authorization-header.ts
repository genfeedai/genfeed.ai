/**
 * Strictly parses an `Authorization` header into a single scheme and a
 * single token. Real clients never send more than that; a header with
 * surplus whitespace-separated fields (e.g. `Bearer gf_key extra`) is
 * malformed and must be rejected rather than silently truncated.
 *
 * `scheme` preserves the case the client sent (RFC 7235 leaves the wire
 * form alone); `normalizedScheme` is the lowercased form every caller
 * should compare against, so "one scheme rule everywhere" doesn't turn
 * into N callers each hand-rolling their own `.toLowerCase()`.
 *
 * Shared by `CombinedAuthGuard.resolveBearerToken`, `ApiKeyAuthGuard`, and
 * every other Authorization-header consumer in the codebase so they all
 * agree on what counts as a well-formed header — see
 * https://github.com/genfeedai/genfeed.ai/issues/5206.
 */
export interface ParsedAuthorizationHeader {
  scheme: string;
  normalizedScheme: string;
  token: string;
}

export function parseAuthorizationHeader(
  authHeader: string | undefined,
): ParsedAuthorizationHeader | undefined {
  if (!authHeader) {
    return undefined;
  }

  const trimmed = authHeader.trim();
  if (!trimmed) {
    return undefined;
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length !== 2) {
    return undefined;
  }

  const [scheme, token] = parts;
  if (!scheme || !token) {
    return undefined;
  }

  return { normalizedScheme: scheme.toLowerCase(), scheme, token };
}

/**
 * True when the header's first whitespace-separated field is the `bearer`
 * scheme (RFC 7235: scheme names are case-insensitive) — regardless of
 * whether the rest of the header is well-formed.
 *
 * This is deliberately looser than `parseAuthorizationHeader`: it exists to
 * distinguish "a Bearer credential was attempted but is malformed" (which
 * must be rejected outright) from "some other scheme was presented" (e.g.
 * an nginx reverse proxy adding its own `Authorization: Basic ...` in front
 * of the app) — the latter carries no Bearer credential at all and must be
 * treated the same as an absent header, not rejected as malformed.
 */
export function isBearerScheme(authHeader: string | undefined): boolean {
  if (!authHeader) {
    return false;
  }

  const trimmed = authHeader.trim();
  if (!trimmed) {
    return false;
  }

  const [firstField] = trimmed.split(/\s+/);
  return firstField.toLowerCase() === 'bearer';
}
