import {
  GENERATION_SETUP_MOOD_PREVIEW_KEYS,
  GENERATION_SETUP_STYLE_PREVIEW_KEYS,
  getGenerationSetupLookPreviewTile,
} from '@ui/constants/generation-setup-look-preview.constant';
import { describe, expect, it } from 'vitest';

describe('curated Look previews', () => {
  it('maps the 29 seeded styles and moods to distinct atlas tiles', () => {
    const tiles = [
      ...GENERATION_SETUP_STYLE_PREVIEW_KEYS.map((key) =>
        getGenerationSetupLookPreviewTile('style', key, true),
      ),
      ...GENERATION_SETUP_MOOD_PREVIEW_KEYS.map((key) =>
        getGenerationSetupLookPreviewTile('mood', key, true),
      ),
    ];
    expect(tiles).toEqual(Array.from({ length: 29 }, (_, index) => index));
  });

  it('does not misrepresent custom options or unknown defaults with a curated example', () => {
    expect(
      getGenerationSetupLookPreviewTile('style', 'anime', false),
    ).toBeUndefined();
    expect(getGenerationSetupLookPreviewTile('mood', 'dreamy')).toBeUndefined();
    expect(
      getGenerationSetupLookPreviewTile('style', 'new-style', true),
    ).toBeUndefined();
    expect(
      getGenerationSetupLookPreviewTile(undefined, 'anime', true),
    ).toBeUndefined();
  });
});
