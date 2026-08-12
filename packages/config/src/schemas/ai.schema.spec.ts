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
