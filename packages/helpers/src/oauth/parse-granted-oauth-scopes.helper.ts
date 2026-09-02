import type { GrantedScopesCredentialPatch } from '@genfeedai/contracts/interfaces';

const SCOPE_SEPARATOR = /[,\s]+/;

/** Reads `scope` when a token payload actually includes the field. */
export function readOAuthTokenScopeField(tokenResponse: unknown): unknown {
  if (!tokenResponse || typeof tokenResponse !== 'object') {
    return undefined;
  }

  if (!('scope' in tokenResponse)) {
    return undefined;
  }

  return tokenResponse.scope;
}

/**
 * Normalizes a provider `scope` field (space-delimited, comma-delimited, or
 * string array) into a unique, sorted grant list.
 */
export function parseGrantedOAuthScopes(value: unknown): string[] {
  const scopes = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(SCOPE_SEPARATOR)
      : [];

  return [
    ...new Set(
      scopes
        .filter((scope): scope is string => typeof scope === 'string')
        .map((scope) => scope.trim())
        .filter(Boolean),
    ),
  ].sort();
}

/**
 * Persist payload for a credential when the provider actually returned a
 * scope field. `undefined`/`null` means "not captured this round" and must
 * not overwrite a previously stored grant.
 */
export function buildGrantedScopesCredentialPatch(
  scope: unknown,
  capturedAt: Date = new Date(),
): GrantedScopesCredentialPatch | undefined {
  if (scope === undefined || scope === null) {
    return undefined;
  }

  return {
    grantedScopes: parseGrantedOAuthScopes(scope),
    grantedScopesCapturedAt: capturedAt,
  };
}
