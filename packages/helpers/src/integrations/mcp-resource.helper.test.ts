import {
  buildProtectedResourceMetadataPaths,
  deriveMcpResourceIdentifier,
  MCP_RESOURCE_URL_ENV_KEYS,
  McpResourceConfigurationError,
  resolveMcpResourceIdentifier,
} from './mcp-resource.helper';

describe('deriveMcpResourceIdentifier', () => {
  it.each([
    'https://mcp.genfeed.ai',
    'https://mcp.genfeed.ai/',
    'https://mcp.genfeed.ai/mcp',
    'https://mcp.genfeed.ai/mcp/',
    'https://mcp.genfeed.ai/mcp//',
  ])('normalizes %s to a single identifier', (spelling) => {
    expect(deriveMcpResourceIdentifier(spelling)).toBe(
      'https://mcp.genfeed.ai/mcp',
    );
  });

  it('keeps a path prefix in front of /mcp', () => {
    expect(deriveMcpResourceIdentifier('http://localhost:3010/genfeed')).toBe(
      'http://localhost:3010/genfeed/mcp',
    );
    expect(
      deriveMcpResourceIdentifier('http://localhost:3010/genfeed/mcp/'),
    ).toBe('http://localhost:3010/genfeed/mcp');
  });

  it('rejects non-http protocols', () => {
    expect(() => deriveMcpResourceIdentifier('ftp://mcp.genfeed.ai')).toThrow(
      McpResourceConfigurationError,
    );
  });

  it('rejects relative and malformed values naming the source key', () => {
    expect(() =>
      deriveMcpResourceIdentifier(
        'mcp.genfeed.ai/mcp',
        'GENFEEDAI_MCP_PUBLIC_URL',
      ),
    ).toThrow(/GENFEEDAI_MCP_PUBLIC_URL/);
  });

  it('rejects query strings and fragments', () => {
    expect(() =>
      deriveMcpResourceIdentifier(
        'https://mcp.genfeed.ai/mcp?toolsets=content',
      ),
    ).toThrow(McpResourceConfigurationError);
    expect(() =>
      deriveMcpResourceIdentifier('https://mcp.genfeed.ai/mcp#x'),
    ).toThrow(McpResourceConfigurationError);
  });
});

describe('resolveMcpResourceIdentifier', () => {
  it('reads the shared key order and reports the winning key', () => {
    expect(MCP_RESOURCE_URL_ENV_KEYS).toEqual([
      'GENFEEDAI_MCP_PUBLIC_URL',
      'GENFEEDAI_MICROSERVICES_MCP_URL',
    ]);

    const env: Record<string, string | undefined> = {
      GENFEEDAI_MCP_PUBLIC_URL: 'https://mcp.genfeed.ai',
      GENFEEDAI_MICROSERVICES_MCP_URL: 'http://mcp:3014',
    };
    expect(
      resolveMcpResourceIdentifier((key) => env[key], 'http://localhost:3014'),
    ).toEqual({
      identifier: 'https://mcp.genfeed.ai/mcp',
      sourceKey: 'GENFEEDAI_MCP_PUBLIC_URL',
    });
  });

  it('falls through blank values to the next key and then the fallback', () => {
    const env: Record<string, string | undefined> = {
      GENFEEDAI_MCP_PUBLIC_URL: '  ',
      GENFEEDAI_MICROSERVICES_MCP_URL: 'http://mcp:3014/',
    };
    expect(
      resolveMcpResourceIdentifier((key) => env[key], 'http://localhost:3014'),
    ).toEqual({
      identifier: 'http://mcp:3014/mcp',
      sourceKey: 'GENFEEDAI_MICROSERVICES_MCP_URL',
    });
    expect(
      resolveMcpResourceIdentifier(() => undefined, 'http://localhost:3014'),
    ).toEqual({
      identifier: 'http://localhost:3014/mcp',
      sourceKey: null,
    });
  });

  it('fails loudly on a configured but invalid value', () => {
    expect(() =>
      resolveMcpResourceIdentifier(
        (key) => (key === 'GENFEEDAI_MCP_PUBLIC_URL' ? 'nope' : undefined),
        'http://localhost:3014',
      ),
    ).toThrow(/GENFEEDAI_MCP_PUBLIC_URL/);
  });
});

describe('buildProtectedResourceMetadataPaths', () => {
  it('serves the bare and the path-suffixed well-known locations', () => {
    expect(
      buildProtectedResourceMetadataPaths('https://mcp.genfeed.ai/mcp'),
    ).toEqual([
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
    ]);
  });

  it('serves only the bare location for a root resource', () => {
    expect(
      buildProtectedResourceMetadataPaths('https://mcp.genfeed.ai/'),
    ).toEqual(['/.well-known/oauth-protected-resource']);
  });
});
