import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { API_KEY_POST_READ_SCOPES } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { isReadOnlyToolName } from '@genfeedai/actions';
import { hasExplicitApiKeyAdminScope } from '@genfeedai/contracts';
import { API_KEY_PERMISSION_GROUPS } from '@genfeedai/contracts/constants';
import { ForbiddenException } from '@nestjs/common';

/** What a route does to tenant data, as far as the API-key baseline cares. */
export type ApiKeyRouteAccess = 'read' | 'write';

const READ_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

const registryResources = API_KEY_PERMISSION_GROUPS.flatMap(
  (group) => group.resources,
);

/** Every resource write scope in the permission registry. */
const WRITE_CAPABLE_SCOPES: ReadonlySet<string> = new Set(
  registryResources.flatMap((resource) => resource.writeScopes),
);

/**
 * Every resource scope in the registry. A write level always includes the
 * resource's read scopes, so a write scope is also read-capable.
 */
const READ_CAPABLE_SCOPES: ReadonlySet<string> = new Set([
  ...registryResources.flatMap((resource) => resource.readScopes),
  ...WRITE_CAPABLE_SCOPES,
]);

/**
 * The access a request needs when its route declares no `@RequiredScopes`.
 * GET/HEAD/OPTIONS read; every other method (and an unknown one) writes.
 * `@ApiKeyReadAccess()` marks a non-GET route that changes no tenant data.
 */
export function resolveApiKeyRouteAccess(
  method: string | undefined,
  declaredAccess: ApiKeyRouteAccess | undefined,
): ApiKeyRouteAccess {
  if (declaredAccess) {
    return declaredAccess;
  }
  return method && READ_METHODS.has(method.toUpperCase()) ? 'read' : 'write';
}

/**
 * Deny-by-default baseline for API-key routes without `@RequiredScopes`.
 *
 * - `admin` keys pass every route (they are minted server-side only).
 * - A read route needs any resource scope from the permission registry
 *   (`*:read` or a resource write scope).
 * - A write route needs a resource write scope (`*:create|update|delete`,
 *   `posts:*`, `brands:write`). A key holding only `*:read` scopes cannot
 *   mutate anything.
 *
 * Narrow privileged scopes (`credits:provision`, `managed-inference:execute`)
 * satisfy only the routes that name them.
 */
export function hasApiKeyBaselineAccess(
  scopes: readonly string[] | undefined,
  access: ApiKeyRouteAccess,
): boolean {
  if (!Array.isArray(scopes)) {
    return false;
  }
  if (hasExplicitApiKeyAdminScope(scopes)) {
    return true;
  }
  const capable =
    access === 'read' ? READ_CAPABLE_SCOPES : WRITE_CAPABLE_SCOPES;
  return scopes.some((scope) => capable.has(scope));
}

/**
 * Read tools whose data has its own permission (#9129): the MCP connector
 * reaches them through `/agent-tools`, so they need the same scopes as the
 * matching REST route (`GET /posts`).
 */
const AGENT_TOOL_READ_SCOPES: Readonly<Record<string, readonly string[]>> = {
  get_posts: API_KEY_POST_READ_SCOPES,
};

/**
 * `POST /agent-tools/:name/execute` dispatches read and write tools alike, so
 * the route takes the read baseline and each tool is held to the baseline its
 * own effect needs: a tool not known to be read-only needs a write scope.
 */
export function assertApiKeyAgentToolBaselineAccess(
  user: Pick<AuthenticatedUser, 'isApiKey' | 'scopes'>,
  toolName: string,
): void {
  if (user.isApiKey !== true) {
    return;
  }
  const toolScopes = AGENT_TOOL_READ_SCOPES[toolName];
  if (toolScopes) {
    if (toolScopes.some((scope) => user.scopes?.includes(scope))) {
      return;
    }
    throw new ForbiddenException({
      code: 'API_KEY_SCOPE_REQUIRED',
      detail: `The ${toolName} tool requires ${toolScopes[0]}.`,
      title: 'Insufficient API key scope',
    });
  }
  const access: ApiKeyRouteAccess = isReadOnlyToolName(toolName)
    ? 'read'
    : 'write';
  if (hasApiKeyBaselineAccess(user.scopes, access)) {
    return;
  }
  throw new ForbiddenException({
    code: 'API_KEY_SCOPE_REQUIRED',
    detail: `The ${toolName} tool requires an API key with ${access} access.`,
    title: 'Insufficient API key scope',
  });
}
