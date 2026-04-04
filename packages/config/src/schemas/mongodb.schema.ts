import Joi from 'joi';

/**
 * MongoDB connection config.
 * All named database URIs (auth, agent, core, etc.) are derived at runtime
 * from MONGODB_URL by replacing the database name segment.
 */
export const mongodbSchema = {
  MONGODB_URL: Joi.string().required(),
};
