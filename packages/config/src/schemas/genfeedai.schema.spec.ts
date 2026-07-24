import Joi from 'joi';

describe('Genfeed URL schema', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('requires public OAuth URLs in cloud deployments', async () => {
    vi.stubEnv('GENFEED_CLOUD', 'true');
    vi.resetModules();
    const { genfeedaiUrlsSchema } = await import('./genfeedai.schema');
    const schema = Joi.object({
      GENFEEDAI_API_PUBLIC_URL: genfeedaiUrlsSchema.GENFEEDAI_API_PUBLIC_URL,
      GENFEEDAI_MCP_PUBLIC_URL: genfeedaiUrlsSchema.GENFEEDAI_MCP_PUBLIC_URL,
    });

    expect(schema.validate({}).error).toBeDefined();
    expect(
      schema.validate({
        GENFEEDAI_API_PUBLIC_URL: 'https://api.genfeed.ai',
        GENFEEDAI_MCP_PUBLIC_URL: 'https://mcp.genfeed.ai/mcp',
      }).error,
    ).toBeUndefined();
  });

  it('allows self-hosted deployments to use service URL fallbacks', async () => {
    vi.stubEnv('GENFEED_CLOUD', '');
    vi.resetModules();
    const { genfeedaiUrlsSchema } = await import('./genfeedai.schema');
    const schema = Joi.object({
      GENFEEDAI_API_PUBLIC_URL: genfeedaiUrlsSchema.GENFEEDAI_API_PUBLIC_URL,
      GENFEEDAI_MCP_PUBLIC_URL: genfeedaiUrlsSchema.GENFEEDAI_MCP_PUBLIC_URL,
    });

    expect(schema.validate({}).error).toBeUndefined();
  });
});
