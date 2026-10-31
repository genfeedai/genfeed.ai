import type { InternalCaller } from '@libs/auth/internal-caller-keys';
import { SetMetadata } from '@nestjs/common';

export const INTERNAL_CALLERS_METADATA = 'internalCallers';

/**
 * Declares which services may call a route guarded by `AdminApiKeyGuard`.
 * The guard accepts only those services' keys and rejects every request on a
 * route that declares none.
 */
export const InternalCallers = (...callers: InternalCaller[]) =>
  SetMetadata(INTERNAL_CALLERS_METADATA, callers);
