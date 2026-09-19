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

  describe('MCP resource URL startup validation (#4553)', () => {
    async function loadMcpSchema(isCloud: boolean) {
      vi.stubEnv('GENFEED_CLOUD', isCloud ? 'true' : '');
      vi.resetModules();
      const {
        genfeedaiMinimalSchema,
        genfeedaiUrlsSchema,
        microservicesSchema,
      } = await import('./genfeedai.schema');
      return Joi.object({
        GENFEEDAI_MCP_PUBLIC_URL: genfeedaiUrlsSchema.GENFEEDAI_MCP_PUBLIC_URL,
        GENFEEDAI_MICROSERVICES_MCP_URL:
          microservicesSchema.GENFEEDAI_MICROSERVICES_MCP_URL,
        MINIMAL_MCP_PUBLIC_URL: genfeedaiMinimalSchema.GENFEEDAI_MCP_PUBLIC_URL,
      });
    }

    it.each([
      'https://mcp.genfeed.ai/mcp',
      'https://mcp.genfeed.ai',
      'https://mcp.genfeed.ai/',
      'https://mcp.genfeed.ai/mcp/',
    ])('accepts %s and keeps the configured value', async (spelling) => {
      const schema = await loadMcpSchema(true);
      const { error, value } = schema.validate({
        GENFEEDAI_MCP_PUBLIC_URL: spelling,
        GENFEEDAI_MICROSERVICES_MCP_URL: spelling,
        MINIMAL_MCP_PUBLIC_URL: spelling,
      });

      expect(error).toBeUndefined();
      expect(value.GENFEEDAI_MCP_PUBLIC_URL).toBe(spelling);
    });

    it.each([
      ['https://mcp.genfeed.ai/mcp?toolsets=content', 'query strings'],
      ['https://mcp.genfeed.ai/mcp#tools', 'fragments'],
      ['ftp://mcp.genfeed.ai/mcp', 'protocol must be http or https'],
    ])(
      'rejects GENFEEDAI_MCP_PUBLIC_URL=%s naming the variable',
      async (configuredValue, reason) => {
        const schema = await loadMcpSchema(true);
        const { error } = schema.validate({
          GENFEEDAI_MCP_PUBLIC_URL: configuredValue,
        });

        expect(error?.message).toContain('GENFEEDAI_MCP_PUBLIC_URL');
        expect(error?.message).toContain(reason);
      },
    );

    it('rejects a relative GENFEEDAI_MCP_PUBLIC_URL naming the variable', async () => {
      const schema = await loadMcpSchema(true);
      const { error } = schema.validate({
        GENFEEDAI_MCP_PUBLIC_URL: 'mcp.genfeed.ai/mcp',
      });

      expect(error?.message).toContain('GENFEEDAI_MCP_PUBLIC_URL');
    });

    it('rejects an invalid GENFEEDAI_MICROSERVICES_MCP_URL naming the variable', async () => {
      const schema = await loadMcpSchema(true);
      const { error } = schema.validate({
        GENFEEDAI_MCP_PUBLIC_URL: 'https://mcp.genfeed.ai/mcp',
        GENFEEDAI_MICROSERVICES_MCP_URL: 'http://mcp:3014/mcp?toolsets=all',
        MINIMAL_MCP_PUBLIC_URL: 'https://mcp.genfeed.ai/mcp',
      });

      expect(error?.message).toContain('GENFEEDAI_MICROSERVICES_MCP_URL');
      expect(error?.message).toContain('query strings');
    });

    it('applies the same rule to the minimal microservice schema', async () => {
      const schema = await loadMcpSchema(true);
      const { error } = schema.validate({
        GENFEEDAI_MCP_PUBLIC_URL: 'https://mcp.genfeed.ai/mcp',
        MINIMAL_MCP_PUBLIC_URL: 'https://mcp.genfeed.ai/mcp#x',
      });

      expect(error?.message).toContain('GENFEEDAI_MCP_PUBLIC_URL');
      expect(error?.message).toContain('fragments');
    });

    it('keeps the self-hosted default and validates configured values', async () => {
      const schema = await loadMcpSchema(false);

      expect(schema.validate({}).value.GENFEEDAI_MICROSERVICES_MCP_URL).toBe(
        'http://localhost:3014',
      );
      expect(
        schema.validate({
          GENFEEDAI_MICROSERVICES_MCP_URL: 'http://genfeed.localhost:3014/',
        }).error,
      ).toBeUndefined();
      expect(
        schema.validate({
          GENFEEDAI_MICROSERVICES_MCP_URL: 'localhost:3014',
        }).error?.message,
      ).toContain('GENFEEDAI_MICROSERVICES_MCP_URL');
    });
  });
});
