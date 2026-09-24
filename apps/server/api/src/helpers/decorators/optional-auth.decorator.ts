import { SetMetadata } from '@nestjs/common';

/**
 * Allows the route when no credential is presented, and still validates a
 * credential when one is. Skills Pro verify and download use this so a receipt
 * secret works without an app session, while an authenticated organization
 * keeps the fail-closed claim path.
 */
export const OPTIONAL_AUTH_KEY = 'optionalAuth';
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);
