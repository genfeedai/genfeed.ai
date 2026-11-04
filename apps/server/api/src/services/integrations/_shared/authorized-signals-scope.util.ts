import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { parseGrantedOAuthScopes } from '@genfeedai/helpers';
import { readRecord } from '@genfeedai/utils/data/extract.util';

export type AuthorizedSignalsScope = {
  granted: string[];
  missing: string[];
  required: string[];
};

/** Splits the required scopes into granted and missing for evidence. */
export function buildAuthorizedSignalsScope(
  required: string[],
  grantedScopes: string[],
): AuthorizedSignalsScope {
  return {
    granted: grantedScopes.filter((scope) => required.includes(scope)),
    missing: required.filter((scope) => !grantedScopes.includes(scope)),
    required,
  };
}

type StoredScopeParams = {
  /** `warmupSignals` key holding the platform's `{ grantedScopes }` record. */
  authorizationStorageKey: string;
  /**
   * Scopes persisted on the credential row. Omit for platforms that do not
   * capture them at connect time.
   */
  credentialScopes?: readonly string[] | null;
  credential: Pick<CredentialDocument, 'warmupSignals'>;
  previousSnapshot: { grantedScopes: string[] } | undefined;
};

function readAuthorizationScopes(
  params: Pick<StoredScopeParams, 'authorizationStorageKey' | 'credential'>,
): unknown {
  const stored = readRecord(params.credential.warmupSignals);

  return readRecord(stored[params.authorizationStorageKey]).grantedScopes;
}

/**
 * Granted scopes in precedence order: explicit (token exchange), persisted on
 * the credential, last observed authorization, then the previous snapshot.
 */
export function resolveAuthorizedGrantedScopes(
  params: StoredScopeParams & {
    explicitScopes: readonly string[] | string | undefined;
  },
): string[] {
  const persistedScopes =
    Array.isArray(params.credentialScopes) && params.credentialScopes.length > 0
      ? params.credentialScopes
      : undefined;

  return parseGrantedOAuthScopes(
    params.explicitScopes ??
      persistedScopes ??
      readAuthorizationScopes(params) ??
      params.previousSnapshot?.grantedScopes,
  );
}

/** Whether any earlier scope observation exists, so scopes need no discovery. */
export function hasStoredScopeObservation(params: StoredScopeParams): boolean {
  return (
    (Array.isArray(params.credentialScopes) &&
      params.credentialScopes.length > 0) ||
    Array.isArray(readAuthorizationScopes(params)) ||
    params.previousSnapshot !== undefined
  );
}
