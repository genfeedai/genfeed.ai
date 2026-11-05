import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { ApiKeyScope } from '@genfeedai/contracts';

/**
 * Class-level API-key scope for a brand controller: reading needs
 * `brands:read`, and a `brands:write` key reads too. A handler that changes a
 * brand declares `brands:write` itself, which overrides this. `extra` adds
 * scopes that also grant the read, such as `analytics:read` on brand analytics.
 */
export const BrandReadScopes = (...extra: ApiKeyScope[]) =>
  RequiredScopes(ApiKeyScope.BRANDS_READ, ApiKeyScope.BRANDS_WRITE, ...extra);
