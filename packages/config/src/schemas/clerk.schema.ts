import Joi from 'joi';

/**
 * Clerk authentication - full config for API
 */
export const clerkSchema = {
  CLERK_PUBLISHABLE_KEY: Joi.string().required(),
  CLERK_SECRET_KEY: Joi.string().required(),
  CLERK_WEBHOOK_SIGNING_SECRET: Joi.string().required(),
};

/**
 * Clerk authentication - minimal for microservices (just secret key for verification)
 */
export const clerkMinimalSchema = {
  CLERK_SECRET_KEY: Joi.string().required(),
};
