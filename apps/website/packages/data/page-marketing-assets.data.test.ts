import { agentClients } from '@data/agent-clients.data';
import { integrations } from '@data/integrations.data';
import { MARKETING_ASSETS } from '@data/marketing-assets.data';
import {
  getPageMarketingAsset,
  PAGE_MARKETING_ASSETS,
} from '@data/page-marketing-assets.data';
import { products } from '@data/products.data';
import { useCases } from '@data/use-cases.data';
import { pitchLandingSlugs } from '@web-components/landing/pitch-pages.data';
import { serviceLandingSlugs } from '@web-components/landing/service-landings.data';
import { describe, expect, it } from 'vitest';

describe('page illustration coverage', () => {
  it('covers every product, agent, service, use case, and social integration', () => {
    const routes = [
      ...products.map(({ slug }) => `/${slug}`),
      ...agentClients.map(({ slug }) => `/${slug}`),
      ...serviceLandingSlugs.map((slug) => `/${slug}`),
      ...pitchLandingSlugs.map((slug) => `/${slug}`),
      ...useCases.map(({ slug }) => `/use-cases/${slug}`),
      ...integrations.map(({ slug }) => `/integrations/${slug}`),
    ];

    for (const route of routes) {
      expect(PAGE_MARKETING_ASSETS, route).toHaveProperty(route);
    }
  });

  it('serves distinct, described website assets through the CDN', () => {
    const assets = Object.values(PAGE_MARKETING_ASSETS);
    expect(PAGE_MARKETING_ASSETS['/turbo']).toEqual(
      PAGE_MARKETING_ASSETS['/studio'],
    );
    const distinctAssets = Object.entries(PAGE_MARKETING_ASSETS)
      .filter(([route]) => route !== '/turbo')
      .map(([, asset]) => asset);
    expect(new Set(distinctAssets.map(({ src }) => src)).size).toBe(
      distinctAssets.length,
    );

    for (const asset of assets) {
      expect(asset.src).toMatch(
        /^https:\/\/cdn\.genfeed\.ai\/assets\/branding\/website\/editorial\/.+-v1\.webp$/,
      );
      expect(asset.alt.length).toBeGreaterThan(15);
    }
  });

  it('uses platform artwork for agent channel variants and a shared comparison asset', () => {
    for (const client of agentClients) {
      expect(getPageMarketingAsset(`/${client.slug}`)).not.toBe(
        MARKETING_ASSETS.integration,
      );
    }
    expect(getPageMarketingAsset('/vs/*').src).toContain('page-comparison');
  });

  it('keeps an explicit fallback for unknown routes', () => {
    expect(getPageMarketingAsset('/unknown')).toBe(
      MARKETING_ASSETS.integration,
    );
  });
});
