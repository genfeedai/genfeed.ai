import Joi from 'joi';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Argil configuration schema', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('requires a non-empty webhook secret in cloud deployments', async () => {
    vi.stubEnv('GENFEED_CLOUD', 'true');
    vi.resetModules();
    const { argilSchema } = await import('./ai.schema');
    const schema = Joi.object(argilSchema);

    expect(schema.validate({}).error).toBeDefined();
    expect(schema.validate({ ARGIL_WEBHOOK_SECRET: '' }).error).toBeDefined();
    expect(
      schema.validate({ ARGIL_WEBHOOK_SECRET: 'argil-webhook-secret' }).error,
    ).toBeUndefined();
  });

  it('keeps Argil configuration optional for self-hosted deployments', async () => {
    vi.stubEnv('GENFEED_CLOUD', 'false');
    vi.resetModules();
    const { argilSchema } = await import('./ai.schema');
    const schema = Joi.object(argilSchema);

    expect(schema.validate({}).error).toBeUndefined();
    expect(schema.validate({ ARGIL_WEBHOOK_SECRET: '' }).error).toBeUndefined();
  });
});

describe('Crun deployment configuration', () => {
  it('defaults admission disabled without requiring a key or platform rate', async () => {
    const { generalAiSchema } = await import('./ai.schema');
    const schema = Joi.object(generalAiSchema);
    expect(schema.validate({}).value.CRUN_ENABLED).toBe('false');
    expect(schema.validate({ CRUN_ENABLED: 'true' }).error).toBeUndefined();
  });

  it.each(['0', '-1', 'NaN', 'Infinity', '', '1e3'])(
    'rejects invalid acquisition rate %s',
    async (rate) => {
      const { generalAiSchema } = await import('./ai.schema');
      expect(
        Joi.object(generalAiSchema).validate({ CRUN_CREDITS_PER_USD: rate })
          .error,
      ).toBeDefined();
    },
  );

  it.each(['0.0001', '100', '100.25'])(
    'preserves a positive decimal rate %s',
    async (rate) => {
      const { generalAiSchema } = await import('./ai.schema');
      const result = Joi.object(generalAiSchema).validate({
        CRUN_CREDITS_PER_USD: rate,
      });
      expect(result.error).toBeUndefined();
      expect(result.value.CRUN_CREDITS_PER_USD).toBe(rate);
    },
  );
});
