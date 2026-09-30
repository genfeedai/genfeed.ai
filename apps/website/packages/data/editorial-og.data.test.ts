// @vitest-environment node
import { AGENT_CLIENT_CHANNEL_SLUGS } from '@data/agent-client-channels.data';
import { AGENT_CLIENT_SLUGS } from '@data/agent-clients.data';
import { competitors } from '@data/competitors.data';
import { ARTICLE_OG_CARDS } from '@data/editorial-og.data';
import { integrations } from '@data/integrations.data';
import {
  getMarketingOgImage,
  MARKETING_OG_CARDS,
  MARKETING_OG_PATHS,
} from '@data/marketing-og.data';
import { products } from '@data/products.data';
import { useCases } from '@data/use-cases.data';
import { describe, expect, it } from 'vitest';

function expectDedicated(path: string) {
  const image = getMarketingOgImage(path, path);
  expect(image.url).not.toBe('https://genfeed.ai/og');
  expect(MARKETING_OG_CARDS[MARKETING_OG_PATHS[path]].artwork).toContain(
    'https://cdn.genfeed.ai/',
  );
}

describe('dedicated editorial OG coverage', () => {
  it('covers every catalog product, integration and audience', () => {
    for (const product of products) expectDedicated(`/${product.slug}`);
    for (const integration of integrations)
      expectDedicated(`/integrations/${integration.slug}`);
    for (const audience of useCases)
      expectDedicated(`/use-cases/${audience.slug}`);
    expectDedicated('/');
  });

  it('gives every client/channel pair its own copy while sharing client artwork', () => {
    for (const slug of AGENT_CLIENT_SLUGS) {
      expectDedicated(`/${slug}`);
      for (const channel of AGENT_CLIENT_CHANNEL_SLUGS) {
        const path = `/${slug}/${channel}`;
        expectDedicated(path);
        const card = MARKETING_OG_CARDS[MARKETING_OG_PATHS[path]];
        expect(card.artwork).toBe(MARKETING_OG_CARDS[slug].artwork);
        expect(card.headline[1]).toMatch(/^on /);
      }
    }
  });

  it('names each comparison and keeps permanent article artwork identities unique', () => {
    for (const competitor of competitors) {
      const path = `/vs/${competitor.slug}`;
      expectDedicated(path);
      expect(MARKETING_OG_CARDS[MARKETING_OG_PATHS[path]].headline).toContain(
        competitor.name,
      );
    }
    expect(Object.keys(ARTICLE_OG_CARDS)).toHaveLength(41);
    expect(new Set(Object.values(ARTICLE_OG_CARDS)).size).toBe(41);
    for (const slug of Object.keys(ARTICLE_OG_CARDS))
      expectDedicated(`/articles/${slug}`);
  });

  it('reserves the generic card for utility and unknown routes', () => {
    expect(getMarketingOgImage('/privacy', 'Privacy').url).toBe(
      'https://genfeed.ai/og',
    );
    expect(getMarketingOgImage('/does-not-exist', 'Missing').url).toBe(
      'https://genfeed.ai/og',
    );
    expect(getMarketingOgImage('/claude/', 'Claude').url).toBe(
      'https://genfeed.ai/og/claude',
    );
  });
});
