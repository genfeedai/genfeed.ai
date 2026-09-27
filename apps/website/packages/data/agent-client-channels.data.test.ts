import { describe, expect, it } from 'vitest';
import {
  AGENT_CLIENT_CHANNEL_SLUGS,
  buildAgentClientChannelJsonLd,
  buildAgentClientChannelPage,
  getAgentClientChannels,
  isAgentClientChannelSlug,
} from './agent-client-channels.data';
import { agentClients, getAgentClient } from './agent-clients.data';
import { getIntegrationBySlug } from './integrations.data';

describe('agent client channel pages', () => {
  it('only lists channels that have an integration page', () => {
    for (const slug of AGENT_CLIENT_CHANNEL_SLUGS) {
      expect(getIntegrationBySlug(slug)).toBeDefined();
    }
    expect(getAgentClientChannels()).toHaveLength(
      AGENT_CLIENT_CHANNEL_SLUGS.length,
    );
  });

  it.each(['discord', 'telegram', 'slack', 'twitch', 'medium'])(
    'never promises posting to %s, which has no publisher',
    (slug) => {
      expect(isAgentClientChannelSlug(slug)).toBe(false);
    },
  );

  it('builds a unique title and a short description for every client and channel', () => {
    const titles = new Set<string>();

    for (const client of agentClients) {
      for (const channel of AGENT_CLIENT_CHANNEL_SLUGS) {
        const page = buildAgentClientChannelPage(client, channel);
        titles.add(page.title);
        expect(page.description.length).toBeLessThanOrEqual(160);
        expect(page.prompts).toHaveLength(3);
        expect(page.features.length).toBeGreaterThan(0);
      }
    }

    expect(titles.size).toBe(
      agentClients.length * AGENT_CLIENT_CHANNEL_SLUGS.length,
    );
  });

  it.each([
    ['ghost', 'Ghost Admin API key'],
    ['beehiiv', 'Beehiiv API key'],
  ] as const)(
    'discloses that %s needs a provider key in Genfeed',
    (slug, keyName) => {
      const page = buildAgentClientChannelPage(getAgentClient('claude'), slug);
      const answer = page.faq.find((item) =>
        item.question.endsWith('API key?'),
      )?.answer;

      expect(answer).toMatch(/^Yes, once\./);
      expect(answer).toContain(keyName);
    },
  );

  it('tells OAuth channels no API key is needed', () => {
    const page = buildAgentClientChannelPage(
      getAgentClient('claude'),
      'linkedin',
    );
    const answer = page.faq.find((item) =>
      item.question.endsWith('API key?'),
    )?.answer;

    expect(answer).toMatch(/^No\./);
  });

  it('titles a page with the channel noun and client name', () => {
    const page = buildAgentClientChannelPage(
      getAgentClient('claude-code'),
      'tiktok',
    );

    expect(page.title).toBe('Schedule TikTok Videos with Claude Code');
  });

  it('emits a three-level breadcrumb and an ordered HowTo', () => {
    const client = getAgentClient('muse');
    const page = buildAgentClientChannelPage(client, 'linkedin');
    const jsonLd = buildAgentClientChannelJsonLd(
      client,
      page,
      'https://genfeed.ai/muse/linkedin',
      'https://genfeed.ai/muse',
    );
    const types = jsonLd['@graph'].map((node) => node['@type']);

    expect(types).toEqual(['WebPage', 'HowTo', 'FAQPage', 'BreadcrumbList']);

    const howTo = jsonLd['@graph'].find((node) => 'step' in node);
    const steps = howTo && 'step' in howTo ? howTo.step : [];
    expect(steps.map((step) => step.position)).toEqual(
      steps.map((_, index) => index + 1),
    );
    expect(steps[0]?.name).toBe('Paste into Meta Muse');
  });
});
