import { describe, expect, it } from 'vitest';
import {
  AGENT_CLIENT_CAPABILITIES,
  AGENT_CLIENT_EXAMPLE_PROMPTS,
  AGENT_CLIENT_FAMILIES,
  AGENT_CLIENT_SLUGS,
  agentClients,
  buildAgentClientJsonLd,
  GENFEED_PUBLIC_MCP_URL,
  getAgentClient,
  getAgentClientCommandBlocks,
  getAgentClientManualBlocks,
  renderAgentConnectMarkdown,
} from './agent-clients.data';

describe('agent clients', () => {
  it('offers every client exactly once across the family chooser', () => {
    const slugs = AGENT_CLIENT_FAMILIES.flatMap((family) => [...family.slugs]);
    expect([...slugs].sort()).toEqual([...AGENT_CLIENT_SLUGS].sort());
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('builds one page per slug with integration-first positioning', () => {
    expect(agentClients.map((client) => client.slug)).toEqual([
      ...AGENT_CLIENT_SLUGS,
    ]);

    for (const client of agentClients) {
      expect(client.title).toBe(`Genfeed for ${client.name}`);
      expect(client.description.length).toBeLessThanOrEqual(160);
      expect(client.about.length).toBeGreaterThan(0);
    }
  });

  it.each(['muse', 'grok-bot'] as const)(
    'connects %s through a pasted chat prompt with OAuth only',
    (slug) => {
      const client = getAgentClient(slug);
      const blocks = getAgentClientCommandBlocks(client);

      expect(blocks[0]).toEqual({
        label: `Paste into ${client.name}`,
        value: client.chatPrompt,
      });
      expect(client.chatPrompt).toContain(
        `MCP server URL: ${GENFEED_PUBLIC_MCP_URL}`,
      );
      expect(client.manualKey).toBeUndefined();
      expect(getAgentClientManualBlocks(client)).toEqual([]);
      expect(JSON.stringify(client)).not.toMatch(/GENFEED_API_KEY|Bearer/);
    },
  );

  it('installs Claude Code with the MCP command and requires browser OAuth', () => {
    const client = getAgentClient('claude-code');
    const labels = getAgentClientCommandBlocks(client).map(
      (block) => block.label,
    );

    expect(client.chatPrompt).toBeUndefined();
    expect(labels).toEqual([
      'Connect URL',
      'Install command',
      'Configuration',
      'Verify',
    ]);
    expect(getAgentClientManualBlocks(client)).toEqual([]);
  });

  it('emits FAQPage and HowTo structured data from the page content', () => {
    const client = getAgentClient('muse');
    const jsonLd = buildAgentClientJsonLd(client, 'https://genfeed.ai/muse');
    const types = jsonLd['@graph'].map((node) => node['@type']);

    expect(types).toEqual(['WebPage', 'HowTo', 'FAQPage', 'BreadcrumbList']);

    const faq = jsonLd['@graph'].find((node) => 'mainEntity' in node);
    expect(faq && 'mainEntity' in faq ? faq.mainEntity : []).toHaveLength(
      client.faq.length,
    );
  });

  it('renders chat-connector clients into the agent markdown without a manual key', () => {
    const markdown = renderAgentConnectMarkdown({
      includeManualKey: true,
      pricingSummary: 'Pay when you publish.',
    });
    const museSection = markdown.slice(
      markdown.indexOf('### Meta Muse'),
      markdown.length,
    );

    expect(museSection).toContain('**Paste into Meta Muse**');
    expect(museSection).not.toContain('Advanced: scoped API key');
  });
});

describe('Claude connects to the full-access URL', () => {
  it.each(['claude', 'claude-code', 'claude-cowork'] as const)(
    'gives %s the same URL and capabilities as every other client',
    (slug) => {
      const client = getAgentClient(slug);
      expect(client.connectUrl).toBe(GENFEED_PUBLIC_MCP_URL);
      expect(client.oauth.configuration).toContain(GENFEED_PUBLIC_MCP_URL);
      expect(client.capabilities).toBe(AGENT_CLIENT_CAPABILITIES);
      expect(client.examplePrompts).toBe(AGENT_CLIENT_EXAMPLE_PROMPTS);
      expect(JSON.stringify(client)).not.toMatch(
        /\/mcp\/claude|second connector|full Genfeed/,
      );
    },
  );
});
