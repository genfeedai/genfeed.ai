import { buildConnectGenfeedInstructions } from './connect-genfeed.helper';

describe('buildConnectGenfeedInstructions', () => {
  it('builds a secret-safe Claude Code command', () => {
    const instructions = buildConnectGenfeedInstructions(
      'claude-code',
      'https://mcp.genfeed.ai/mcp',
    );

    expect(instructions.primaryCommand).toContain(
      'claude mcp add --transport http genfeed',
    );
    expect(instructions.primaryCommand).toContain(
      'Authorization: Bearer $GENFEED_API_KEY',
    );
    expect(instructions.environmentCommand).toBe(
      'read -s GENFEED_API_KEY && export GENFEED_API_KEY',
    );
    expect(instructions.environmentCommand).not.toContain('paste-key');
    expect(instructions.primaryCommand).not.toContain('gf_');
  });

  it('builds Codex CLI and TOML configuration from the same endpoint', () => {
    const instructions = buildConnectGenfeedInstructions(
      'codex',
      'http://localhost:3014/mcp/',
    );

    expect(instructions.primaryCommand).toBe(
      'codex mcp add genfeed --url http://localhost:3014/mcp --bearer-token-env-var GENFEED_API_KEY',
    );
    expect(instructions.configuration).toContain(
      'url = "http://localhost:3014/mcp"',
    );
    expect(instructions.configuration).toContain(
      'bearer_token_env_var = "GENFEED_API_KEY"',
    );
  });

  it('builds generic Streamable HTTP configuration without a real key', () => {
    const instructions = buildConnectGenfeedInstructions(
      'generic',
      'https://mcp.genfeed.ai/mcp',
    );

    expect(JSON.parse(instructions.configuration)).toEqual({
      headers: {
        Authorization: ['Bearer $', '{GENFEED_API_KEY}'].join(''),
      },
      transport: 'streamable-http',
      url: 'https://mcp.genfeed.ai/mcp',
    });
    expect(instructions.configuration).not.toContain('gf_');
  });

  it('rejects non-HTTP endpoints', () => {
    expect(() =>
      buildConnectGenfeedInstructions('codex', 'file:///tmp/mcp'),
    ).toThrow('The MCP endpoint must use HTTP or HTTPS.');
  });
});
