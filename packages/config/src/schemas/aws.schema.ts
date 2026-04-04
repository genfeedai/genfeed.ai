import Joi from 'joi';

/**
 * AWS / S3 config
 */
export const awsSchema = {
  AWS_ACCESS_KEY_ID: Joi.string().required(),
  AWS_IMAGE_COMPRESSION: Joi.number().default(50),
  AWS_REGION: Joi.string().default('us-west-1'),
  AWS_S3_BUCKET: Joi.string().default('cdn.genfeed.ai'),
  AWS_SECRET_ACCESS_KEY: Joi.string().required(),
};

/**
 * AWS config with optional credentials (for services that may use IAM roles)
 */
export const awsOptionalSchema = {
  AWS_ACCESS_KEY_ID: Joi.string().optional().allow(''),
  AWS_IMAGE_COMPRESSION: Joi.number().default(50),
  AWS_REGION: Joi.string().default('us-west-1'),
  AWS_S3_BUCKET: Joi.string().default('cdn.genfeed.ai'),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional().allow(''),
};
