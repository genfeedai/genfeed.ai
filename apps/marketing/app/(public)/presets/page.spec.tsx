import { buildPresetPages } from '@data/presets.data';
import { catalogWithExamples } from '@data/presets.fixture';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pages: [] as ReturnType<typeof buildPresetPages>,
}));

vi.mock('@data/presets.data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@data/presets.data')>()),
  getPresetPages: () => state.pages,
  hasPresetPages: () => state.pages.length > 0,
}));

const { default: PresetsPage } = await import('./page');

describe('/presets route', () => {
  beforeEach(() => {
    state.pages = [];
  });

  it('is not found while no preset has an example', () => {
    expect(() => PresetsPage()).toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/,
    );
  });

  it('renders the hub and its structured data once a preset has an example', () => {
    state.pages = buildPresetPages(catalogWithExamples(['studio-meme']));

    const element = PresetsPage();

    expect(element).toBeTruthy();
    expect(JSON.stringify(element)).toContain('CollectionPage');
  });
});
