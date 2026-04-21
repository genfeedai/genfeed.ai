import Joi from 'joi';

/**
 * PostgreSQL / Prisma connection config.
 */
export const postgresSchema = {
  DATABASE_URL: Joi.string().required(),
};
