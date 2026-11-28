import { buildPresetPages } from '@data/presets.data';
import { catalogWithExamples } from '@data/presets.fixture';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pages: [] as ReturnType<typeof buildPresetPages>,
}));

vi.mock('@data/presets.data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@data/presets.data')>()),
  getAllPresetSlugs: () => state.pages.map((page) => page.slug),
  hasPresetPages: () => state.pages.length > 0,
}));

vi.mock('@services/external/public.service', () => ({
  PublicService: {
    getInstance: () => ({
      findAllPublicArticles: () => Promise.reject(new Error('API unavailable')),
      findPublicArticlesPage: () => Promise.resolve({ items: [], total: 0 }),
      findPublicBrands: () => Promise.resolve([]),
      findPublicImagesPage: () => Promise.resolve({ items: [], total: 0 }),
      findPublicPosts: () => Promise.resolve([]),
      findPublicPostsPage: () => Promise.resolve({ items: [], total: 0 }),
      findPublicVideosPage: () => Promise.resolve({ items: [], total: 0 }),
    }),
  },
}));

vi.mock('@data/releases.data', () => ({
  getPublishedReleases: () => Promise.resolve([]),
}));

const { default: sitemap } = await import('./sitemap');

const presetPaths = async () =>
  (await sitemap())
    .map((route) => route.url)
    .filter((url) => url.startsWith('https://genfeed.ai/presets'));

describe('sitemap presets', () => {
  beforeEach(() => {
    state.pages = [];
  });

  it('lists no preset page while no preset has an example', async () => {
    expect(await presetPaths()).toEqual([]);
  });

  it('lists the hub and one page per preset that has an example', async () => {
    state.pages = buildPresetPages(
      catalogWithExamples(['ad-ugc-selfie', 'studio-meme']),
    );

    expect(await presetPaths()).toEqual([
      'https://genfeed.ai/presets',
      'https://genfeed.ai/presets/meme',
      'https://genfeed.ai/presets/ugc-selfie-ad',
    ]);
  });
});
