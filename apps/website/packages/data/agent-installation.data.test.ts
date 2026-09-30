import { describe, expect, it } from 'vitest';
import {
  GENFEED_PUBLIC_MCP_URL,
  getAgentClient,
  getAgentClientCommandBlocks,
} from './agent-clients.data';
import { buildCursorInstallUrl } from './agent-installation.data';

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

  it('distinguishes packaged installs from registration and skill-only setup', () => {
    expect(getAgentClient('claude-code').installation.command).toContain(
      '/plugin install genfeed@genfeed',
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

  it('does not invent a ChatGPT directory listing', () => {
    expect(getAgentClient('chatgpt').installation.instruction).toContain(
      'not yet listed',
    );
    expect(getAgentClient('chatgpt').installation.destination).not.toContain(
      'plugin_asdk_app',
    );
  });
});
