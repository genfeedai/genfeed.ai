import Joi from 'joi';
import { isEEEnabled } from '../license';

const required = isEEEnabled() ? Joi.string().required() : Joi.string().optional().allow('');

/**
 * Clerk authentication - full config for API
 * Optional in core mode (no auth), required in EE/cloud mode.
 */
export const clerkSchema = {
  CLERK_PUBLISHABLE_KEY: required,
  CLERK_SECRET_KEY: required,
  CLERK_WEBHOOK_SIGNING_SECRET: required,
};

/**
 * Clerk authentication - minimal for microservices (just secret key for verification)
 */
export const clerkMinimalSchema = {
  CLERK_SECRET_KEY: required,
};
