import Joi from 'joi';

/**
 * Redis connection config
 */
export const redisSchema = {
  REDIS_PASSWORD: Joi.string()
    .optional()
    .description('Redis authentication password. Recommended for production.'),
  REDIS_TLS: Joi.boolean()
    .default(false)
    .description('Enable TLS for Redis connections (use with rediss:// URLs)'),
  REDIS_URL: Joi.string().uri().default('redis://localhost:6379'),
};
