import {
  buildConnectGenfeedChatPrompt,
  buildConnectGenfeedInstructions,
  buildGenfeedAgentSetupPrompt,
} from './connect-genfeed.helper';
import { deriveClaudeMcpResourceIdentifier } from './mcp-resource.helper';

describe('buildGenfeedAgentSetupPrompt', () => {
  it('sets up only the chosen client and verifies without content writes', () => {
    const prompt = buildGenfeedAgentSetupPrompt(
      'https://mcp.genfeed.ai/mcp/',
      'Codex',
    );
    expect(prompt).toContain('for Codex.');
    expect(prompt).toContain('npx skills add genfeedai/agent');
    expect(prompt).toContain(
      'Skip this step if the playbook is already available',
    );
    expect(prompt).toContain('Authenticate only the selected client');
    expect(prompt).toContain('read-only get_account and get_brands');
    expect(prompt).toContain(
      'Do not generate content, schedule, publish, or resolve approvals',
    );
    expect(prompt).not.toMatch(/GENFEED_API_KEY|Bearer/);
  });

  it('uses quoted endpoints in commands and rejects unsupported protocols', () => {
    const prompt = buildGenfeedAgentSetupPrompt(
      'https://mcp.genfeed.ai/mcp?toolsets=content',
    );
    expect(prompt).toContain(
      "--url 'https://mcp.genfeed.ai/mcp?toolsets=content'",
    );
    expect(() => buildGenfeedAgentSetupPrompt('file:///tmp/mcp')).toThrow();
  });
});

describe('Claude setup endpoint separation', () => {
  it('uses the canonical Claude resource throughout setup from a custom host root', () => {
    const prompt = buildGenfeedAgentSetupPrompt('https://custom.example/');
    expect(prompt).toContain(
      'Claude endpoint: https://custom.example/mcp/claude',
    );
    expect(prompt).toContain('--scope user https://custom.example/mcp/claude');
    expect(prompt).not.toContain('https://custom.example/claude');
  });

  it.each([
    'https://mcp.genfeed.ai/mcp?toolsets=generation',
    'https://mcp.genfeed.ai/mcp/claude/?profile=full',
  ])(
    'keeps Claude restricted while offering standard Codex setup for %s',
    (endpoint) => {
      const prompt = buildGenfeedAgentSetupPrompt(endpoint, 'Claude Code');
      expect(prompt).toContain(
        'Claude endpoint: https://mcp.genfeed.ai/mcp/claude',
      );
      expect(prompt).toContain(
        '/plugin install genfeed --marketplace genfeedai/agent',
      );
      expect(prompt).toContain('codex mcp add genfeed --url');
      expect(prompt).not.toContain(
        'codex mcp add genfeed --url https://mcp.genfeed.ai/mcp/claude',
      );
      expect(prompt).not.toContain('generation/claude');
      expect(prompt).toContain('Claude requires OAuth');
      expect(prompt).toContain('Never run skills add for any Claude client');
      expect(prompt).toContain('For non-Claude clients, install');
    },
  );
});

describe('buildConnectGenfeedChatPrompt', () => {
  it('names the normalized endpoint and OAuth without requesting a secret', () => {
    const prompt = buildConnectGenfeedChatPrompt('https://mcp.genfeed.ai/mcp/');

    expect(prompt).toContain('MCP server URL: https://mcp.genfeed.ai/mcp\n');
    expect(prompt).toContain('OAuth');
    expect(prompt).toContain('list my Genfeed brands');
    expect(prompt).not.toMatch(/GENFEED_API_KEY|Bearer/);
  });

  it('rejects non-HTTP endpoints', () => {
    expect(() => buildConnectGenfeedChatPrompt('file:///tmp/mcp')).toThrow(
      'The MCP endpoint must use HTTP or HTTPS.',
    );
  });
});

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
      'claude mcp add --transport http genfeed --scope user https://mcp.genfeed.ai/mcp/claude',
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

  it.each(['claude-code', 'generic'] as const)(
    'requires OAuth for %s on the Claude connector',
    (client) => {
      const instructions = buildConnectGenfeedInstructions(
        client,
        'https://mcp.genfeed.ai/mcp/claude/?profile=full',
        'manual-key',
      );
      expect(instructions.authMethod).toBe('oauth');
      expect(instructions.environmentCommand).toBe('');
      expect(JSON.parse(instructions.configuration).url).toBe(
        'https://mcp.genfeed.ai/mcp/claude',
      );
      expect(JSON.stringify(instructions)).not.toMatch(
        /GENFEED_API_KEY|Bearer|manual-key|profile/,
      );
    },
  );

  it('moves Claude Code from the full endpoint to the dedicated resource', () => {
    const instructions = buildConnectGenfeedInstructions(
      'claude-code',
      'https://mcp.genfeed.ai/mcp?toolsets=generation',
    );
    expect(instructions.primaryCommand).toBe(
      'claude mcp add --transport http genfeed --scope user https://mcp.genfeed.ai/mcp/claude',
    );
  });

  it.each([
    'https://custom.example',
    'https://custom.example/',
    'https://custom.example/?toolsets=generation#setup',
  ])('connects Claude Code to /mcp/claude from host root %s', (endpoint) => {
    const instructions = buildConnectGenfeedInstructions(
      'claude-code',
      endpoint,
    );
    expect(JSON.parse(instructions.configuration).url).toBe(
      'https://custom.example/mcp/claude',
    );
  });

  it('does not derive the Claude suffix twice after the app resolves a custom host root', () => {
    const endpoint = deriveClaudeMcpResourceIdentifier(
      'https://custom.example/',
    );
    const instructions = buildConnectGenfeedInstructions(
      'claude-code',
      endpoint,
    );
    expect(JSON.parse(instructions.configuration).url).toBe(
      'https://custom.example/mcp/claude',
    );
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
