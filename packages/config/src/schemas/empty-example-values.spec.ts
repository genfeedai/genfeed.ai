import Joi from 'joi';
import { describe, expect, it } from 'vitest';
import { awsOptionalSchema, awsSchema } from './aws.schema';
import { webhooksSchema } from './webhooks.schema';

describe('empty optional values copied from .env.example', () => {
  it('accepts an empty extension id', () => {
    const { error } = Joi.object(webhooksSchema).validate({
      CHROME_EXTENSION_ID: '',
    });

    expect(error).toBeUndefined();
  });

  it('still rejects an extension id of the wrong length', () => {
    const { error } = Joi.object(webhooksSchema).validate({
      CHROME_EXTENSION_ID: 'short',
    });

    expect(error).toBeDefined();
  });

  it.each([
    ['required credentials', awsSchema],
    ['optional credentials', awsOptionalSchema],
  ])(
    'falls back to the default bucket for an empty value (%s)',
    (_label, schema) => {
      const { error, value } = Joi.object(schema).unknown(true).validate({
        AWS_ACCESS_KEY_ID: 'key',
        AWS_S3_BUCKET: '',
        AWS_SECRET_ACCESS_KEY: 'secret',
      });

      expect(error).toBeUndefined();
      expect(value.AWS_S3_BUCKET).toBe('cdn.genfeed.ai');
    },
  );
});
