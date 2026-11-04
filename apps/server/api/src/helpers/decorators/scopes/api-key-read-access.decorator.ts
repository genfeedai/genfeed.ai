import { API_KEY_ROUTE_ACCESS_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import type { ApiKeyRouteAccess } from '@api/helpers/utils/auth/api-key-baseline-scope.util';
import { SetMetadata } from '@nestjs/common';

const READ_ACCESS: ApiKeyRouteAccess = 'read';

/**
 * Marks a non-GET route that changes no tenant data (a query, a validation,
 * a session switch, or a dispatcher that enforces its own per-action checks).
 * API keys without `@RequiredScopes` then need only the read baseline instead
 * of a write-capable scope. See `hasApiKeyBaselineAccess`.
 */
export const ApiKeyReadAccess = () =>
  SetMetadata(API_KEY_ROUTE_ACCESS_KEY, READ_ACCESS);
