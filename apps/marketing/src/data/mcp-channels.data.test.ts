import { AGENT_CLIENT_CHANNEL_SLUGS } from '@data/agent-client-channels.data';
import { agentClients } from '@data/agent-clients.data';
import {
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_DESCRIPTION_MIN_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  SEO_TITLE_MIN_LENGTH,
  withBrandSuffix,
} from '@data/seo-copy';
import { getChannelCapability } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { describe, expect, it } from 'vitest';
import {
  buildMcpChannelJsonLd,
  buildMcpChannelPage,
  isMcpChannelSlug,
  MCP_CHANNEL_SLUGS,
} from './mcp-channels.data';

const PLATFORM_OF: Record<string, string> = { 'x-twitter': 'twitter' };

describe('MCP channel pages', () => {
  it('builds pages in the order the search demand sets', () => {
    expect(MCP_CHANNEL_SLUGS).toEqual([
      'linkedin',
      'instagram',
      'youtube',
      'x-twitter',
      'tiktok',
      'facebook',
    ]);
  });

  it('only covers channels the scheduler lists as supported', () => {
    for (const slug of MCP_CHANNEL_SLUGS) {
      expect(getChannelCapability(PLATFORM_OF[slug] ?? slug)?.status).toBe(
        'supported',
      );
    }
  });

  it('has no page for Threads, Bluesky, Reddit or Pinterest', () => {
    for (const slug of ['threads', 'bluesky', 'reddit', 'pinterest']) {
      expect(isMcpChannelSlug(slug)).toBe(false);
    }
  });

  it('stays inside the agent-by-channel list so every page links down', () => {
    for (const slug of MCP_CHANNEL_SLUGS) {
      expect(AGENT_CLIENT_CHANNEL_SLUGS).toContain(slug);
    }
  });

  it.each(MCP_CHANNEL_SLUGS)(
    'keeps the %s title and description in budget',
    (slug) => {
      const page = buildMcpChannelPage(slug);
      const title = withBrandSuffix(page.title);

      expect(title.length).toBeGreaterThanOrEqual(SEO_TITLE_MIN_LENGTH);
      expect(title.length).toBeLessThanOrEqual(SEO_TITLE_MAX_LENGTH);
      expect(page.title).toContain('MCP Server');
      expect(page.description.length).toBeGreaterThanOrEqual(
        SEO_DESCRIPTION_MIN_LENGTH,
      );
      expect(page.description.length).toBeLessThanOrEqual(
        SEO_DESCRIPTION_MAX_LENGTH,
      );
    },
  );

  it('states the caption ceiling the scheduler enforces', () => {
    const x = buildMcpChannelPage('x-twitter');
    const instagram = buildMcpChannelPage('instagram');

    expect(x.limits.join(' ')).toContain('280 characters');
    expect(instagram.limits.join(' ')).toContain('2,200 characters');
    expect(instagram.limits.join(' ')).toContain('At most 5 hashtags');
  });

  it('says LinkedIn posts go out as a person, not a company page', () => {
    expect(buildMcpChannelPage('linkedin').limits.join(' ')).toContain(
      'not as a company page',
    );
  });

  it('says YouTube takes video only', () => {
    expect(buildMcpChannelPage('youtube').limits[0]).toContain(
      'Supports video and short video',
    );
  });

  it('answers FAQ and HowTo and Breadcrumb in the JSON-LD', () => {
    const page = buildMcpChannelPage('tiktok');
    const graph = buildMcpChannelJsonLd(page, 'https://genfeed.ai/mcp/tiktok')[
      '@graph'
    ];

    expect(graph.map((node) => node['@type'])).toEqual([
      'WebPage',
      'HowTo',
      'FAQPage',
      'BreadcrumbList',
    ]);
    expect(page.faq.length).toBeGreaterThanOrEqual(5);
  });

  it('names every agent client in the FAQ', () => {
    const answer = buildMcpChannelPage('facebook').faq.find((item) =>
      item.question.startsWith('Which agents'),
    )?.answer;

    for (const client of agentClients) {
      expect(answer).toContain(client.name);
    }
  });
});
