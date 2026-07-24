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
    });
    const metadata = buildOAuthAuthorizationServerMetadata(serviceConfig);

    expect(metadata.issuer).toBe('https://api.genfeed.ai');
    expect(metadata.authorization_endpoint).toBe(
      'https://api.genfeed.ai/v1/oauth/authorize',
    );
    expect(metadata.code_challenge_methods_supported).toEqual(['S256']);
    expect(metadata.token_endpoint_auth_methods_supported).toEqual(['none']);
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
});
