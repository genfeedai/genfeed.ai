import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route as requiring an active cloud connection (valid Clerk token).
 *
 * In LOCAL mode: always returns 401.
 * In HYBRID mode: returns 401 if no valid Clerk token is present.
 * In CLOUD mode: standard Clerk auth (same as default).
 */
export const REQUIRES_CLOUD_AUTH_KEY = 'requiresCloudAuth';
export const RequiresCloudAuth = () =>
  SetMetadata(REQUIRES_CLOUD_AUTH_KEY, true);
