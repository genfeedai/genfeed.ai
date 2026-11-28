import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ hasPresets: false }));

vi.mock('@data/presets.data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@data/presets.data')>()),
  hasPresetPages: () => state.hasPresets,
}));

async function footerHrefs(): Promise<string[]> {
  vi.resetModules();
  const { WEBSITE_SECTIONS } = await import('@web-components/home/_footer');
  return WEBSITE_SECTIONS.flatMap((section) =>
    section.links.map((link) => link.href),
  );
}

async function directoryHrefs(): Promise<string[]> {
  vi.resetModules();
  const { SITE_DIRECTORY } = await import(
    '../../app/(public)/sitemap/sitemap-content'
  );
  return SITE_DIRECTORY.flatMap((section) =>
    section.links.map((link) => link.href),
  );
}

describe('presets navigation', () => {
  it('links /presets nowhere while no preset has a page', async () => {
    state.hasPresets = false;

    expect(await footerHrefs()).not.toContain('/presets');
    expect(await directoryHrefs()).not.toContain('/presets');
  });

  it('links /presets in the footer and the site directory once a preset has a page', async () => {
    state.hasPresets = true;

    expect(await footerHrefs()).toContain('/presets');
    expect(await directoryHrefs()).toContain('/presets');
  });
});
