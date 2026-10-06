import { describe, expect, it } from 'vitest';
import {
  GENFEED_PUBLIC_MCP_URL,
  getAgentClient,
  getAgentClientCommandBlocks,
} from './agent-clients.data';
import {
  buildCursorInstallUrl,
  buildHermesInstallUrl,
} from './agent-installation.data';

describe('platform installation contracts', () => {
  it('passes the hosted URL as native Cursor config without credentials', () => {
    const link = new URL(buildCursorInstallUrl(GENFEED_PUBLIC_MCP_URL));
    expect(link.origin + link.pathname).toBe(
      'https://cursor.com/link/mcp/install',
    );
    expect(link.searchParams.get('name')).toBe('genfeed');
    expect(JSON.parse(atob(link.searchParams.get('config') ?? ''))).toEqual({
      url: GENFEED_PUBLIC_MCP_URL,
    });
  });

  it('encodes the Hermes native OAuth install and exposes its actual YAML config', () => {
    const client = getAgentClient('hermes');
    const link = new URL(buildHermesInstallUrl(GENFEED_PUBLIC_MCP_URL));
    expect(link.protocol).toBe('hermes:');
    expect(link.hostname + link.pathname).toBe('mcp/install');
    const config = (link.searchParams.get('config') ?? '')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    expect(JSON.parse(atob(config))).toEqual({
      url: GENFEED_PUBLIC_MCP_URL,
      auth: 'oauth',
    });
    expect(client.installation.destination).toBe(link.href);
    expect(client.oauth.configuration).toBe(
      `mcp_servers:\n  genfeed:\n    url: ${GENFEED_PUBLIC_MCP_URL}\n    auth: oauth`,
    );
    expect(client.oauth.primaryCommand).toBe('hermes mcp login genfeed');
    expect(client.manualKey).toBeUndefined();
    expect(
      getAgentClientCommandBlocks(client).map((block) => block.label),
    ).toEqual(['Connect URL', '~/.hermes/config.yaml', 'Authorize Hermes']);
  });

  it('distinguishes packaged installs from registration and skill-only setup', () => {
    expect(getAgentClient('claude-code').installation.command).toContain(
      '/plugin install genfeed --marketplace genfeedai/agent',
    );
    expect(getAgentClient('codex').installation.instruction).toContain(
      'Registration alone does not install',
    );
    expect(getAgentClient('gemini').installation.command).toBe(
      'gemini extensions install https://github.com/genfeedai/agent',
    );
    expect(getAgentClient('openclaw').installation.instruction).toContain(
      'Skill installation alone does not connect',
    );
  });

  it.each(['chatgpt', 'claude', 'claude-cowork', 'grok'] as const)(
    'keeps %s on browser OAuth without generic config or key instructions',
    (slug) => {
      const client = getAgentClient(slug);
      expect(client.manualKey).toBeUndefined();
      expect(
        getAgentClientCommandBlocks(client).map((block) => block.label),
      ).toEqual(['Connect URL']);
      expect(client.installation.destination).toMatch(/^https:\/\//);
    },
  );

  it.each(['claude', 'claude-cowork'] as const)(
    'sends %s to Customize rather than the retired settings page',
    (slug) => {
      const installation = getAgentClient(slug).installation;
      expect(installation.destination).toBe(
        'https://claude.ai/customize/connectors',
      );
      expect(installation.instruction).toContain('Customize → Connectors');
    },
  );

  it('explains ChatGPT write-access requirements', () => {
    expect(getAgentClient('chatgpt').installation.instruction).toContain(
      'Full read/write MCP access requires Business or Enterprise/Edu',
    );
    expect(getAgentClient('chatgpt').installation.instruction).toContain(
      'Pro supports read/fetch',
    );
  });

  it('does not invent a ChatGPT directory listing', () => {
    expect(getAgentClient('chatgpt').installation.instruction).toContain(
      'not yet listed',
    );
    expect(getAgentClient('chatgpt').installation.destination).not.toContain(
      'plugin_asdk_app',
    );
  });
});
