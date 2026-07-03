import Joi from 'joi';

/**
 * Redis connection config.
 *
 * Base connection (`REDIS_URL`/`REDIS_PASSWORD`/`REDIS_TLS`) is shared by the
 * application pub/sub bus. The four isolated workloads (#1186) — BullMQ queues,
 * HTTP cache, Better Auth rate limiting, socket.io fan-out — each default to a
 * distinct logical database on this base connection and can be pointed at a
 * dedicated instance via their `REDIS_<WORKLOAD>_URL` override. All overrides are
 * optional and fall back to the base config, so no coordinated multi-service
 * deploy is required to roll isolation out.
 */
export const redisSchema = {
  REDIS_CACHE_DB: Joi.number()
    .optional()
    .description('Logical DB index for the HTTP response cache (default 1).'),
  REDIS_CACHE_URL: Joi.string()
    .uri()
    .optional()
    .description(
      'Dedicated Redis endpoint for the HTTP cache. Falls back to REDIS_URL.',
    ),
  REDIS_PASSWORD: Joi.string()
    .optional()
    .description('Redis authentication password. Recommended for production.'),
  REDIS_QUEUE_DB: Joi.number()
    .optional()
    .description('Logical DB index for BullMQ queues (default 0).'),
  REDIS_QUEUE_URL: Joi.string()
    .uri()
    .optional()
    .description(
      'Dedicated Redis endpoint for BullMQ queues. Falls back to REDIS_URL.',
    ),
  REDIS_RATELIMIT_DB: Joi.number()
    .optional()
    .description('Logical DB index for Better Auth rate limiting (default 2).'),
  REDIS_RATELIMIT_URL: Joi.string()
    .uri()
    .optional()
    .description(
      'Dedicated Redis endpoint for auth rate limiting. Falls back to REDIS_URL.',
    ),
  REDIS_SOCKET_DB: Joi.number()
    .optional()
    .description(
      'Logical DB index for the socket.io fan-out adapter (default 3).',
    ),
  REDIS_SOCKET_URL: Joi.string()
    .uri()
    .optional()
    .description(
      'Dedicated Redis endpoint for socket.io fan-out. Falls back to REDIS_URL.',
    ),
  REDIS_TLS: Joi.boolean()
    .default(false)
    .description('Enable TLS for Redis connections (use with rediss:// URLs)'),
  REDIS_URL: Joi.string().uri().default('redis://localhost:6379'),
};
