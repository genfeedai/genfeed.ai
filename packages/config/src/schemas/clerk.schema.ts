import { conditionalRequired } from '../helpers';

/**
 * Clerk authentication - full config for API
 * Optional in self-hosted mode (no auth), required in cloud mode.
 */
export const clerkSchema = {
  CLERK_PUBLISHABLE_KEY: conditionalRequired(),
  CLERK_SECRET_KEY: conditionalRequired(),
  CLERK_WEBHOOK_SIGNING_SECRET: conditionalRequired(),
};

/**
 * Clerk authentication - minimal for microservices (just secret key for verification)
 */
export const clerkMinimalSchema = {
  CLERK_SECRET_KEY: conditionalRequired(),
};
