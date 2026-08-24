import Joi from 'joi';
import { isSelfHostedDeployment } from './deployment';

/**
 * Sentinel written into SSM / env templates when a required cloud secret is
 * not provisioned yet. Truthy, so Joi `required()` and empty-string checks
 * both treat it as configured — OAuth then sends `client_id=PLACEHOLDER_NOT_CONFIGURED`
 * to the provider. Runtime readers must treat it as unset.
 */
export const UNCONFIGURED_SECRET_SENTINEL = 'PLACEHOLDER_NOT_CONFIGURED';

export function isUnconfiguredSecret(value: unknown): boolean {
  return (
    typeof value === 'string' && value.trim() === UNCONFIGURED_SECRET_SENTINEL
  );
}

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
