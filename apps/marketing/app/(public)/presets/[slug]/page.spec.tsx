import { buildPresetPages } from '@data/presets.data';
import { catalogWithExamples } from '@data/presets.fixture';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pages: [] as ReturnType<typeof buildPresetPages>,
}));

vi.mock('@data/presets.data', async (importOriginal) => {
  const original = await importOriginal<typeof import('@data/presets.data')>();
  return {
    ...original,
    getAllPresetSlugs: () => state.pages.map((page) => page.slug),
    getPresetPageBySlug: (slug: string) =>
      state.pages.find((page) => page.slug === slug),
    getRelatedPresetPages: (
      page: Parameters<typeof original.getRelatedPresetPages>[0],
    ) => original.getRelatedPresetPages(page, state.pages),
  };
});

const {
  default: PresetPage,
  generateMetadata,
  generateStaticParams,
} = await import('./page');

describe('/presets/[slug] route', () => {
  beforeEach(() => {
    state.pages = buildPresetPages(
      catalogWithExamples(['ad-ugc-selfie', 'studio-meme']),
    );
  });

  it('generates one page for each preset that has an example, and none for the rest', () => {
    expect(generateStaticParams()).toEqual([
      { slug: 'meme' },
      { slug: 'ugc-selfie-ad' },
    ]);

    state.pages = [];
    expect(generateStaticParams()).toEqual([]);
  });

  it('does not render a preset without a page', async () => {
    await expect(
      PresetPage({ params: Promise.resolve({ slug: 'remove-background' }) }),
    ).rejects.toThrow();
  });

  it('titles the page with the preset name and points the canonical at it', async () => {
    const metadata = await generateMetadata(
      { params: Promise.resolve({ slug: 'ugc-selfie-ad' }) },
      Promise.resolve({ openGraph: { images: [] } }) as never,
    );

    expect(metadata.title).toBe(
      'UGC selfie ad prompt and examples | Genfeed.ai',
    );
    expect(metadata.alternates?.canonical).toBe(
      'https://genfeed.ai/presets/ugc-selfie-ad',
    );
    expect(metadata.description?.length).toBeGreaterThanOrEqual(110);
  });
});
