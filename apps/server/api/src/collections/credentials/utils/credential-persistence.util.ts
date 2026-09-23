import { createHash } from 'node:crypto';
import type { CredentialDocument } from '@api/collections/credentials/credential.types';

/**
 * Columns that describe *this connection* rather than *this account*. When a
 * reconnect resolves to an account the brand already holds, these move onto the
 * incumbent row; everything else it owns — label, description, posting times,
 * warm-up state, tags, and every row that foreign-keys to its id — stays put.
 */
const CARRIED_CONNECTION_COLUMNS = [
  'accessToken',
  'accessTokenExpiry',
  'accessTokenSecret',
  'grantedScopes',
  'grantedScopesCapturedAt',
  'oauthToken',
  'oauthTokenHash',
  'oauthTokenSecret',
  'refreshToken',
  'refreshTokenExpiry',
  'userId',
  'username',
] as const;

export function hashOAuthRequestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function requireCredentialRelationId(
  value: unknown,
  field: string,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} is required to persist a credential`);
  }

  return value;
}

/** Connection-bearing columns to move onto a surviving incumbent row. */
export function pickCarriedConnectionColumns(
  credential: CredentialDocument,
): Record<string, unknown> {
  const source = credential as unknown as Record<string, unknown>;

  return CARRIED_CONNECTION_COLUMNS.reduce<Record<string, unknown>>(
    (carried, column) => {
      if (source[column] !== undefined) {
        carried[column] = source[column];
      }

      return carried;
    },
    {},
  );
}
