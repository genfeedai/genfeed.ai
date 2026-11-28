import { describe, expect, it } from 'vitest';
import { renderGenerated } from './sync-product-presets';

const CLIP_EXAMPLE = {
  alt: 'A founder talks to camera.',
  aspectRatio: '9:16',
  mediaType: 'video',
  posterUrl: 'https://cdn.genfeed.ai/presets/poster.jpg',
  url: 'https://cdn.genfeed.ai/presets/clip.mp4',
};

const CATALOG = {
  groups: {
    ad: ['ad-one'],
    b2b: ['b2b-one'],
    cinematic: ['cinematic-one'],
    studio: ['studio-one'],
  },
};

function render(examples: Record<string, unknown> = {}): string {
  const presets: Record<string, unknown> = {
    'ad/ad-one/preset.json': { key: 'ad-one' },
    'b2b/b2b-one/preset.json': { key: 'b2b-one', mediaType: 'image' },
    'cinematic/cinematic-one/preset.json': { key: 'cinematic-one' },
    'studio/studio-one/preset.json': { key: 'studio-one', type: 'image-edit' },
  };
  return renderGenerated(CATALOG, 'a'.repeat(40), (path) =>
    JSON.stringify({
      ...(presets[path] as object),
      ...(examples[path] ? { examples: examples[path] } : {}),
    }),
  );
}

describe('renderGenerated', () => {
  it('keeps examples out of the preset data and lists them by preset key', () => {
    const generated = render({ 'ad/ad-one/preset.json': [CLIP_EXAMPLE] });

    expect(generated).toContain('PRESET_EXAMPLE_DATA');
    expect(generated).toContain('"ad-one": [');
    expect(generated).not.toMatch(/"key": "ad-one",\s*"examples"/);
    expect(generated.match(/"examples"/g)).toBeNull();
  });

  it('writes an empty example map while no preset has an example', () => {
    expect(render()).toContain(
      'PRESET_EXAMPLE_DATA: Readonly<Record<string, readonly PresetExample[]>> = {};',
    );
  });

  it('refuses an example that is not on the public CDN', () => {
    expect(() =>
      render({
        'ad/ad-one/preset.json': [
          { ...CLIP_EXAMPLE, url: 'https://example.com/a.mp4' },
        ],
      }),
    ).toThrow(/ad\/ad-one\/preset.json: .*examples\[0\]\.url/);
  });

  it('refuses a video example on an image preset', () => {
    expect(() => render({ 'b2b/b2b-one/preset.json': [CLIP_EXAMPLE] })).toThrow(
      /mediaType must be image on a preset that makes image/,
    );
  });
});
