import type {
  InstagramDebugTokenResponse,
  InstagramTokenGrant,
} from '@genfeedai/contracts/interfaces/integrations/instagram.interface';

/**
 * The permission without which an authorization can never publish, read
 * insights, or tell which account it refers to.
 */
export const INSTAGRAM_BASIC_SCOPE = 'instagram_basic';

/**
 * Read a `debug_token` answer into the permissions it lists and the Instagram
 * accounts the customer chose for `instagram_basic` in Meta's dialog.
 */
export function toInstagramTokenGrant(
  data: InstagramDebugTokenResponse['data'],
): InstagramTokenGrant {
  const granular = Array.isArray(data?.granular_scopes)
    ? data.granular_scopes
    : [];

  const scopedPermissions = granular
    .map((entry) => entry.scope)
    .filter((name): name is string => typeof name === 'string');
  // A Business Integration System User token can list its permissions only
  // under `granular_scopes` and leave `scopes` empty. An empty list is Meta
  // saying nothing, not Meta saying "none", so it must not read as a missing
  // permission: the grant is the union of both lists, and unknown when both
  // are empty.
  const grantedScopes = [
    ...new Set([
      ...(Array.isArray(data?.scopes) ? data.scopes : []),
      ...scopedPermissions,
    ]),
  ];

  return {
    instagramTargetIds: [
      ...new Set(
        granular
          .filter((entry) => entry.scope === INSTAGRAM_BASIC_SCOPE)
          .flatMap((entry) => entry.target_ids ?? []),
      ),
    ],
    scopedPermissions,
    scopes: grantedScopes.length > 0 ? grantedScopes : undefined,
  };
}
