import { buildConnectGenfeedInstructions } from './connect-genfeed.helper';

describe('buildConnectGenfeedInstructions', () => {
  it.each(['codex', 'claude-code', 'generic'] as const)(
    'defaults %s to browser authorization without secret requirements',
    (client) => {
      const instructions = buildConnectGenfeedInstructions(
        client,
        'https://custom.example/mcp/',
      );
      expect(instructions.authMethod).toBe('oauth');
      expect(instructions.environmentCommand).toBe('');
      expect(instructions.configuration).toContain(
        'https://custom.example/mcp',
      );
      expect(JSON.stringify(instructions)).not.toMatch(
        /GENFEED_API_KEY|Bearer|bearer_token_env_var/,
      );
      expect(instructions.authorizationInstruction).toContain('browser');
    },
  );

  it('provides the supported client authorization steps', () => {
    const codex = buildConnectGenfeedInstructions(
      'codex',
      'https://mcp.genfeed.ai/mcp',
    );
    const claude = buildConnectGenfeedInstructions(
      'claude-code',
      'https://mcp.genfeed.ai/mcp',
    );
    expect(codex.primaryCommand).toBe(
      'codex mcp add genfeed --url https://mcp.genfeed.ai/mcp',
    );
    expect(codex.authorizationInstruction).toContain('codex mcp login genfeed');
    expect(claude.primaryCommand).toBe(
      'claude mcp add --transport http genfeed --scope user https://mcp.genfeed.ai/mcp',
    );
    expect(claude.authorizationInstruction).toContain('/mcp');
  });

  it('quotes configured endpoints with shell metacharacters', () => {
    const instructions = buildConnectGenfeedInstructions(
      'codex',
      'https://custom.example/mcp?x=1&y=2',
    );
    expect(instructions.primaryCommand).toBe(
      "codex mcp add genfeed --url 'https://custom.example/mcp?x=1&y=2'",
    );
  });

  it('builds a secret-safe Claude Code command', () => {
    const instructions = buildConnectGenfeedInstructions(
      'claude-code',
      'https://mcp.genfeed.ai/mcp',
      'manual-key',
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
      'manual-key',
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
      'manual-key',
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

  it('removes a long run of trailing slashes from a valid endpoint', () => {
    const instructions = buildConnectGenfeedInstructions(
      'codex',
      `https://mcp.genfeed.ai/mcp${'/'.repeat(50_000)}`,
      'manual-key',
    );

    expect(instructions.primaryCommand).toContain(
      'https://mcp.genfeed.ai/mcp --bearer-token-env-var',
    );
  });
});
