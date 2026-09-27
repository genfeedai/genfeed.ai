import { describe, expect, it } from 'vitest';
import {
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
  it('builds one page per slug with a search-intent title', () => {
    expect(agentClients.map((client) => client.slug)).toEqual([
      ...AGENT_CLIENT_SLUGS,
    ]);

    for (const client of agentClients) {
      expect(client.title).toBe(
        `Create and Schedule Social Media Posts with ${client.name}`,
      );
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

  it('keeps the dedicated install command and manual key path for Claude Code', () => {
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
    expect(getAgentClientManualBlocks(client).length).toBeGreaterThan(0);
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
      pricingSummary: 'Free to join.',
    });
    const museSection = markdown.slice(
      markdown.indexOf('### Meta Muse'),
      markdown.length,
    );

    expect(museSection).toContain('**Paste into Meta Muse**');
    expect(museSection).not.toContain('Advanced: scoped API key');
  });
});
