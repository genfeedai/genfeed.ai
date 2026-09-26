/**
 * Strictly parses an `Authorization` header into a single scheme and a
 * single token. Real clients never send more than that; a header with
 * surplus whitespace-separated fields (e.g. `Bearer gf_key extra`) is
 * malformed and must be rejected rather than silently truncated.
 *
 * Shared by `CombinedAuthGuard.resolveBearerToken` and `ApiKeyAuthGuard` so
 * both guards agree on what counts as a well-formed header — see
 * https://github.com/genfeedai/genfeed.ai/issues/5206.
 */
export interface ParsedAuthorizationHeader {
  scheme: string;
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

  return { scheme, token };
}
