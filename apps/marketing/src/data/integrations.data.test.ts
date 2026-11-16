import { describe, expect, it } from 'vitest';
import {
  getAllIntegrationSlugs,
  INTEGRATION_CTA,
  integrations,
} from './integrations.data';

const PAGE_COPY = JSON.stringify(integrations).toLowerCase();

describe('integrations data', () => {
  it('lists the 22 platform pages once each', () => {
    expect(getAllIntegrationSlugs()).toEqual([
      'youtube',
      'tiktok',
      'instagram',
      'linkedin',
      'facebook',
      'x-twitter',
      'pinterest',
      'reddit',
      'discord',
      'twitch',
      'wordpress',
      'snapchat',
      'whatsapp',
      'mastodon',
      'ghost',
      'shopify',
      'beehiiv',
      'medium',
      'threads',
      'telegram',
      'slack',
      'fanvue',
    ]);
  });

  it('uses one plain button label on every page', () => {
    expect(INTEGRATION_CTA).toBe('Connect Agent');
  });

  it.each([
    'ai-powered',
    'viral',
    'at scale',
    'maximum',
    'dominate',
    'algorithm',
    'engaging',
    'professional',
    'thought leadership',
    'scroll-stopping',
    'stunning',
    'optimized',
    'veo',
    'sora',
  ])('keeps "%s" out of the page copy', (phrase) => {
    expect(PAGE_COPY).not.toContain(phrase);
  });

  it('ends no tagline with a full stop', () => {
    expect(
      integrations.filter((integration) => integration.tagline.endsWith('.')),
    ).toEqual([]);
  });

  it('shows results only for platforms Genfeed reads analytics from', () => {
    expect(
      integrations
        .filter((integration) => integration.results)
        .map((integration) => integration.slug),
    ).toEqual([
      'youtube',
      'tiktok',
      'instagram',
      'linkedin',
      'facebook',
      'x-twitter',
      'pinterest',
      'mastodon',
      'threads',
    ]);
  });
});
