import {
  buildOAuthAuthorizationServerMetadata,
  resolveMcpResourceUrl,
  resolveOAuthIssuerUrl,
} from './oauth-metadata.util';

function config(values: Record<string, string | undefined>) {
  return {
    get: (key: string) => values[key],
  } as never;
}

describe('OAuth metadata', () => {
  it('uses the public API issuer instead of the internal service URL', () => {
    const serviceConfig = config({
      GENFEEDAI_API_PUBLIC_URL: 'https://api.genfeed.ai/',
      GENFEEDAI_API_URL: 'http://api.genfeed.internal:3010',
      GENFEEDAI_MCP_PUBLIC_URL: 'https://mcp.genfeed.ai/mcp',
    });
    const metadata = buildOAuthAuthorizationServerMetadata(serviceConfig);

    expect(metadata.issuer).toBe('https://api.genfeed.ai');
    expect(metadata.authorization_endpoint).toBe(
      'https://api.genfeed.ai/v1/oauth/authorize',
    );
    expect(metadata.code_challenge_methods_supported).toEqual(['S256']);
    expect(metadata.grant_types_supported).toEqual([
      'authorization_code',
      'refresh_token',
    ]);
    expect(metadata.token_endpoint_auth_methods_supported).toEqual(['none']);
    expect(metadata.revocation_endpoint).toBe(
      'https://api.genfeed.ai/v1/oauth/revoke',
    );
    expect(metadata.revocation_endpoint_auth_methods_supported).toEqual([
      'none',
    ]);
    expect(metadata.protected_resources).toEqual([
      'https://mcp.genfeed.ai/mcp',
    ]);
    expect(metadata.agent_auth).toEqual({
      claim_endpoint: 'https://api.genfeed.ai/v1/agent/auth/claim',
      claim_uri: 'https://api.genfeed.ai/v1/agent/auth/claim',
      identity_endpoint: 'https://api.genfeed.ai/v1/agent/auth',
      identity_types_supported: ['identity_assertion', 'service_auth'],
      identity_assertion: {
        assertion_types_supported: ['verified_email'],
        credential_types_supported: ['api_key'],
      },
      register_uri: 'https://api.genfeed.ai/v1/agent/auth',
      revocation_uri: 'https://api.genfeed.ai/v1/agent/auth/revoke',
      service_auth: {
        credential_types_supported: ['api_key'],
      },
      skill: 'https://genfeed.ai/auth.md',
    });
  });

  it('falls back to service URLs for self-hosted deployments', () => {
    const serviceConfig = config({
      GENFEEDAI_API_URL: 'http://genfeed.localhost:3010/',
      GENFEEDAI_MICROSERVICES_MCP_URL: 'http://genfeed.localhost:3014',
    });

    expect(resolveOAuthIssuerUrl(serviceConfig)).toBe(
      'http://genfeed.localhost:3010',
    );
    expect(resolveMcpResourceUrl(serviceConfig)).toBe(
      'http://genfeed.localhost:3014/mcp',
    );
  });

  describe('protected-resource identifier', () => {
    it.each([
      'https://mcp.genfeed.ai/mcp',
      'https://mcp.genfeed.ai',
      'https://mcp.genfeed.ai/',
      'https://mcp.genfeed.ai/mcp/',
    ])(
      'derives one identifier from GENFEEDAI_MCP_PUBLIC_URL=%s',
      (spelling) => {
        const serviceConfig = config({ GENFEEDAI_MCP_PUBLIC_URL: spelling });

        expect(resolveMcpResourceUrl(serviceConfig)).toBe(
          'https://mcp.genfeed.ai/mcp',
        );
        expect(
          buildOAuthAuthorizationServerMetadata(serviceConfig)
            .protected_resources,
        ).toEqual(['https://mcp.genfeed.ai/mcp']);
      },
    );

    it('prefers the public URL over the internal service URL', () => {
      const serviceConfig = config({
        GENFEEDAI_MCP_PUBLIC_URL: 'https://mcp.genfeed.ai',
        GENFEEDAI_MICROSERVICES_MCP_URL: 'http://mcp.genfeed.internal:3014',
      });

      expect(resolveMcpResourceUrl(serviceConfig)).toBe(
        'https://mcp.genfeed.ai/mcp',
      );
    });

    it.each([
      'http://genfeed.localhost:3014',
      'http://genfeed.localhost:3014/',
      'http://genfeed.localhost:3014/mcp',
    ])(
      'still reads GENFEEDAI_MICROSERVICES_MCP_URL=%s as the fallback key',
      (spelling) => {
        const serviceConfig = config({
          GENFEEDAI_MICROSERVICES_MCP_URL: spelling,
        });

        expect(resolveMcpResourceUrl(serviceConfig)).toBe(
          'http://genfeed.localhost:3014/mcp',
        );
      },
    );

    it('uses the local MCP default when neither key is configured', () => {
      expect(resolveMcpResourceUrl(config({}))).toBe(
        'http://localhost:3014/mcp',
      );
    });

    it('fails naming the variable when the configured URL is invalid', () => {
      expect(() =>
        resolveMcpResourceUrl(
          config({ GENFEEDAI_MCP_PUBLIC_URL: 'mcp.genfeed.ai/mcp' }),
        ),
      ).toThrow(/GENFEEDAI_MCP_PUBLIC_URL/);
    });
  });
});
