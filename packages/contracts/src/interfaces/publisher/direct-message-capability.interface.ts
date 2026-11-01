/**
 * Whether a connected account's stored grant lets Genfeed read its DMs.
 *
 * - `ok`: the grant includes every required DM scope.
 * - `reconnect`: scopes were captured and a required DM scope is missing, so
 *   the account must reconnect to grant it.
 * - `unknown`: the grant was captured before scopes were stored, so the
 *   answer is only known after a sync or a reconnect.
 */
export type DirectMessageCapability = 'ok' | 'reconnect' | 'unknown';

export interface DirectMessageCapabilityInput {
  grantedScopes?: readonly string[] | null;
  grantedScopesCapturedAt?: Date | string | null;
  /** Domain (lowercase) credential platform. */
  platform: string;
}
