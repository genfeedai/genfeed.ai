import Joi from 'joi';
import { isSelfHostedDeployment } from './deployment';

/**
 * Joi schema: required when running in cloud mode, optional in self-hosted.
 * Accepts an optional base schema to extend (e.g., Joi.string().uri()).
 */
export function conditionalRequired(base?: Joi.StringSchema): Joi.StringSchema {
  const schema = base ?? Joi.string();
  if (isSelfHostedDeployment()) {
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
  if (isSelfHostedDeployment()) {
    return schema.optional();
  }
  return schema.required();
}

/**
 * Joi schema for env vars that are required only in self-hosted mode.
 * Use in Joi validation schemas only — runtime checks should call
 * `isSelfHostedDeployment()`.
 */
export const SELF_HOSTED_REQUIRED: Joi.StringSchema = isSelfHostedDeployment()
  ? Joi.string().required()
  : Joi.string().optional().allow('');
