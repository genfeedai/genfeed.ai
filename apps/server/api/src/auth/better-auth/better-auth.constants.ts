/**
 * Better Auth integration constants (epic #735, Phase 1 dual-run — #736).
 */

/** Passport strategy name for the Better Auth JWT/JWKS strategy. */
export const BETTER_AUTH_STRATEGY_NAME = 'better-auth';

/**
 * Path the Better Auth handler is mounted at (under the API's `/v1` prefix).
 * The jwt plugin publishes its JWKS at `${BETTER_AUTH_BASE_PATH}/jwks`.
 */
export const BETTER_AUTH_BASE_PATH = '/v1/auth';

/** DI token for the constructed Better Auth instance. */
export const BETTER_AUTH_INSTANCE = Symbol('BETTER_AUTH_INSTANCE');

/**
 * Emitted (awaited via `emitAsync`) from the `user.create.after` hook so a new
 * user is provisioned before the create completes. Replaces the legacy auth provider
 * `user.created` webhook (epic #735, Phase 4).
 */
export const BETTER_AUTH_USER_CREATED_EVENT = 'better-auth.user.created';
