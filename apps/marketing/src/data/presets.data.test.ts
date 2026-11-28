import { catalogWithExamples } from '@data/presets.fixture';
import {
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_DESCRIPTION_MIN_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  SEO_TITLE_MIN_LENGTH,
  withBrandSuffix,
} from '@data/seo-copy';
import { PRESET_CATALOG } from '@genfeedai/contracts/constants/preset-catalog.constant';
import { describe, expect, it } from 'vitest';
import {
  buildPresetPageJsonLd,
  buildPresetPages,
  buildPresetsHubJsonLd,
  getPresetPagesInGroup,
  getRelatedPresetPages,
  hasPresetPages,
  PRESET_GROUPS,
} from './presets.data';

describe('preset pages', () => {
  it('publishes no page for a preset that has no example', () => {
    expect(buildPresetPages(PRESET_CATALOG)).toEqual([]);
    expect(
      buildPresetPages(catalogWithExamples(['studio-meme'])).map(
        (page) => page.key,
      ),
    ).toEqual(['studio-meme']);
  });

  it('is empty, and links nowhere, while no catalog preset has an example', () => {
    expect(hasPresetPages()).toBe(
      PRESET_CATALOG.some((p) => p.examples.length),
    );
  });

  it('gives each preset its own address, the slug of its label', () => {
    const pages = buildPresetPages(catalogWithExamples());

    expect(pages).toHaveLength(PRESET_CATALOG.length);
    expect(pages.find((page) => page.key === 'ad-ugc-selfie')?.slug).toBe(
      'ugc-selfie-ad',
    );
    expect(new Set(pages.map((page) => page.slug)).size).toBe(pages.length);
  });

  it('refuses to build when two presets would share an address', () => {
    const [first, second] = catalogWithExamples();
    expect(() =>
      buildPresetPages([first, { ...second, label: first.label }]),
    ).toThrow(/share the page address/);
  });

  it('puts every preset in exactly one group', () => {
    for (const preset of PRESET_CATALOG)
      expect(
        PRESET_GROUPS.filter((group) => group.match(preset)).length >= 1,
        preset.key,
      ).toBe(true);

    const pages = buildPresetPages(catalogWithExamples());
    const grouped = PRESET_GROUPS.flatMap((group) =>
      getPresetPagesInGroup(group.id, pages),
    );
    expect(grouped.map((page) => page.key).sort()).toEqual(
      pages.map((page) => page.key).sort(),
    );
  });

  it('keeps every title and description inside the SEO budget', () => {
    for (const page of buildPresetPages(catalogWithExamples())) {
      const title = withBrandSuffix(page.seoTitle);
      expect(title.length, title).toBeGreaterThanOrEqual(SEO_TITLE_MIN_LENGTH);
      expect(title.length, title).toBeLessThanOrEqual(SEO_TITLE_MAX_LENGTH);
      expect(page.seoTitle.toLowerCase()).toContain(page.label.toLowerCase());
      expect(
        page.seoDescription.length,
        page.seoDescription,
      ).toBeGreaterThanOrEqual(SEO_DESCRIPTION_MIN_LENGTH);
      expect(
        page.seoDescription.length,
        page.seoDescription,
      ).toBeLessThanOrEqual(SEO_DESCRIPTION_MAX_LENGTH);
    }
  });

  it('builds the recipe and settings from the catalog values', () => {
    const pages = buildPresetPages(catalogWithExamples());
    const meme = pages.find((page) => page.key === 'studio-meme');
    const selfie = pages.find((page) => page.key === 'ad-ugc-selfie');

    expect(meme?.recipeText).toContain(
      'Create a short reaction meme about your topic.',
    );
    expect(meme?.settings).toContainEqual(['Aspect ratio', '9:16']);
    expect(meme?.settings).toContainEqual(['Length', '5 seconds']);
    expect(selfie?.recipe.map((line) => line.title)).toContain('Dialogue');
    expect(selfie?.settings).toContainEqual([
      'You bring',
      'A script and a voice recording',
    ]);
    for (const page of pages) {
      expect(page.recipe.length, page.key).toBeGreaterThan(0);
      expect(page.settings).toContainEqual(['Preset key', page.key]);
    }
  });

  it('tells an agent the exact preset key to read', () => {
    const [page] = buildPresetPages(catalogWithExamples(['studio-meme']));

    expect(page?.mcpCall).toBe(
      'get_generation_catalog(action="preset", key="studio-meme")',
    );
    expect(page?.agentPrompt).toContain('"studio-meme"');
  });

  it('relates a preset only to the published presets of its own group', () => {
    const pages = buildPresetPages(
      catalogWithExamples(['ad-ugc-selfie', 'ad-talking-head', 'studio-meme']),
    );
    const selfie = pages.find((page) => page.key === 'ad-ugc-selfie');

    expect(
      selfie ? getRelatedPresetPages(selfie, pages).map((p) => p.key) : [],
    ).toEqual(['ad-talking-head']);
  });

  it('marks the examples up as a video or an image in structured data', () => {
    const pages = buildPresetPages(
      catalogWithExamples(['studio-meme', 'studio-banner']),
    );
    const meme = pages.find((page) => page.key === 'studio-meme');
    const banner = pages.find((page) => page.key === 'studio-banner');
    const types = (page: typeof meme) =>
      page
        ? buildPresetPageJsonLd(page)['@graph'].map((node) => node['@type'])
        : [];

    expect(types(meme)).toEqual(
      expect.arrayContaining(['WebPage', 'VideoObject', 'FAQPage']),
    );
    expect(types(banner)).toContain('ImageObject');
    expect(types(banner)).not.toContain('VideoObject');
    expect(buildPresetsHubJsonLd(pages)['@graph'][1]).toMatchObject({
      '@type': 'ItemList',
    });
  });
});
