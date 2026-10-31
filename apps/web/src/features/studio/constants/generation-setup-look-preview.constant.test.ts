import { describe, expect, it } from 'vitest';
import {
  GENERATION_SETUP_CAMERA_MOVEMENT_PREVIEW_KEYS,
  GENERATION_SETUP_CAMERA_PREVIEW_KEYS,
  GENERATION_SETUP_LENS_PREVIEW_KEYS,
  GENERATION_SETUP_LIGHTING_PREVIEW_KEYS,
  GENERATION_SETUP_MOOD_PREVIEW_KEYS,
  GENERATION_SETUP_SCENE_PREVIEW_KEYS,
  GENERATION_SETUP_STYLE_PREVIEW_KEYS,
  getGenerationSetupLookPreviewTile,
} from '@/features/studio/constants/generation-setup-look-preview.constant';

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
    expect(
      tiles.map((tile) => (tile ? tile.row * 4 + tile.column : -1)),
    ).toEqual(Array.from({ length: 29 }, (_, index) => index));
    expect(tiles[0]).toEqual({
      atlasUrl: '/assets/look-previews/preview-atlas.png',
      column: 0,
      columns: 4,
      row: 0,
      rows: 8,
    });
  });

  it.each([
    ['scene', GENERATION_SETUP_SCENE_PREVIEW_KEYS, 'scene-atlas'],
    ['camera', GENERATION_SETUP_CAMERA_PREVIEW_KEYS, 'camera-atlas'],
    ['lens', GENERATION_SETUP_LENS_PREVIEW_KEYS, 'lens-atlas'],
    ['lighting', GENERATION_SETUP_LIGHTING_PREVIEW_KEYS, 'lighting-atlas'],
    [
      'cameraMovement',
      GENERATION_SETUP_CAMERA_MOVEMENT_PREVIEW_KEYS,
      'movement-atlas',
    ],
  ] as const)(
    'maps every %s default to its own tile on a 4 x 4 sheet',
    (kind, keys, sheet) => {
      const tiles = keys.map((key) =>
        getGenerationSetupLookPreviewTile(kind, key, true),
      );
      expect(
        tiles.map((tile) => (tile ? tile.row * 4 + tile.column : -1)),
      ).toEqual(keys.map((_, index) => index));
      expect(
        tiles.every((tile) => tile?.atlasUrl.endsWith(`${sheet}.png`)),
      ).toBe(true);
      expect(tiles.every((tile) => tile?.rows === 4)).toBe(true);
    },
  );

  it('does not misrepresent custom options or unknown defaults with a curated example', () => {
    expect(
      getGenerationSetupLookPreviewTile('style', 'anime', false),
    ).toBeUndefined();
    expect(getGenerationSetupLookPreviewTile('mood', 'dreamy')).toBeUndefined();
    expect(
      getGenerationSetupLookPreviewTile('style', 'new-style', true),
    ).toBeUndefined();
    expect(
      getGenerationSetupLookPreviewTile('scene', 'new-scene', true),
    ).toBeUndefined();
    expect(
      getGenerationSetupLookPreviewTile(undefined, 'anime', true),
    ).toBeUndefined();
  });
});
