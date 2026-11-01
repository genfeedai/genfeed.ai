import { getRequiredDirectMessageScopes } from '@genfeedai/contracts/constants';
import type {
  DirectMessageCapability,
  DirectMessageCapabilityInput,
} from '@genfeedai/contracts/interfaces';

/**
 * Derives whether a credential's stored grant can read DMs, the same way
 * `resolvePermissionScopeReadiness` judges publish scopes: a grant captured
 * before scope storage shipped stays `unknown` instead of guessing.
 *
 * Returns `undefined` for platforms with no DM scope requirement, so callers
 * never show a DM prompt on an account that has no DM surface.
 */
export function resolveDirectMessageCapability(
  input: DirectMessageCapabilityInput,
): DirectMessageCapability | undefined {
  const requiredScopes = getRequiredDirectMessageScopes(input.platform);
  if (!requiredScopes) {
    return undefined;
  }

  if (input.grantedScopesCapturedAt == null) {
    return 'unknown';
  }

  const granted = new Set(input.grantedScopes ?? []);
  return requiredScopes.every((scope) => granted.has(scope))
    ? 'ok'
    : 'reconnect';
}
