import Joi from 'joi';

/**
 * True when running in self-hosted mode (no GENFEED_CLOUD env var).
 */
export const IS_SELF_HOSTED_FLAG = !process.env.GENFEED_CLOUD;

/**
 * Joi schema: required when running in cloud mode, optional in self-hosted.
 * Accepts an optional base schema to extend (e.g., Joi.string().uri()).
 */
export function conditionalRequired(base?: Joi.StringSchema): Joi.StringSchema {
  const schema = base ?? Joi.string();
  if (IS_SELF_HOSTED_FLAG) {
    return schema.optional().allow('');
  }
  return schema.required();
}

/**
 * Joi schema: required number when running in cloud mode, optional in self-hosted.
 */
export function conditionalRequiredNumber(
  base?: Joi.NumberSchema,
): Joi.NumberSchema {
  const schema = base ?? Joi.number();
  if (IS_SELF_HOSTED_FLAG) {
    return schema.optional();
  }
  return schema.required();
}

/**
 * Joi schema for env vars that are required only in self-hosted mode.
 */
export const IS_SELF_HOSTED: Joi.StringSchema = IS_SELF_HOSTED_FLAG
  ? Joi.string().required()
  : Joi.string().optional().allow('');
