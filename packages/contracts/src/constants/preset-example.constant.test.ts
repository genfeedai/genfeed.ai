import { describe, expect, it } from 'vitest';
import type { PresetExample } from '../interfaces/elements/preset-example.interface';
import {
  PRESET_EXAMPLES_MAX,
  presetExampleProblems,
  presetsWithoutExample,
} from './preset-example.constant';

const clip: PresetExample = {
  alt: 'A founder talks to camera.',
  aspectRatio: '9:16',
  mediaType: 'video',
  posterUrl: 'https://cdn.genfeed.ai/presets/clip-poster.jpg',
  url: 'https://cdn.genfeed.ai/presets/clip.mp4',
};
const picture: PresetExample = {
  alt: 'A square portrait.',
  aspectRatio: '1:1',
  mediaType: 'image',
  url: 'https://cdn.genfeed.ai/presets/portrait.png',
};
const edit: PresetExample = {
  ...picture,
  alt: 'A photo with its background removed.',
  sourceUrl: 'https://cdn.genfeed.ai/presets/before.png',
};

describe('preset examples', () => {
  it('accepts a preset with no example, so it can land before its example', () => {
    expect(presetExampleProblems('video', undefined)).toEqual([]);
    expect(presetExampleProblems('video', [])).toEqual([]);
  });

  it('accepts one valid example per output type', () => {
    expect(presetExampleProblems('video', [clip])).toEqual([]);
    expect(presetExampleProblems('image', [picture])).toEqual([]);
    expect(presetExampleProblems('image-edit', [edit])).toEqual([]);
  });

  it.each([
    'https://example.com/clip.mp4',
    'http://cdn.genfeed.ai/clip.mp4',
    'https://cdn.genfeed.ai/clip.mp4?X-Amz-Signature=abc',
    ['https://', 'name', ':', 'word', '@cdn.genfeed.ai/clip.mp4'].join(''),
    'https://cdn.genfeed.ai.evil.com/clip.mp4',
    'not a url',
  ])('refuses %s as an example address', (url) => {
    expect(presetExampleProblems('video', [{ ...clip, url }])).toEqual([
      expect.stringContaining('examples[0].url'),
    ]);
  });

  it('refuses an example whose media type does not match what the preset makes', () => {
    expect(presetExampleProblems('video', [picture])).toContain(
      'examples[0].mediaType must be video on a preset that makes video',
    );
    expect(
      presetExampleProblems('image', [{ ...clip, posterUrl: undefined }]),
    ).toContain(
      'examples[0].mediaType must be image on a preset that makes image',
    );
  });

  it('asks a video for a poster and a photo edit for its source picture', () => {
    expect(
      presetExampleProblems('video', [{ ...clip, posterUrl: undefined }]),
    ).toEqual([expect.stringContaining('posterUrl')]);
    expect(presetExampleProblems('image-edit', [picture])).toEqual([
      expect.stringContaining('sourceUrl'),
    ]);
  });

  it('refuses unknown fields, a missing alt, a bad ratio and too many examples', () => {
    expect(
      presetExampleProblems('image', [{ ...picture, extra: true }]),
    ).toEqual(['examples[0].extra is not a known field']);
    expect(presetExampleProblems('image', [{ ...picture, alt: ' ' }])).toEqual([
      expect.stringContaining('alt'),
    ]);
    expect(
      presetExampleProblems('image', [{ ...picture, aspectRatio: 'square' }]),
    ).toEqual([expect.stringContaining('aspectRatio')]);
    expect(
      presetExampleProblems(
        'image',
        Array.from({ length: PRESET_EXAMPLES_MAX + 1 }, () => picture),
      ),
    ).toEqual([`examples holds at most ${PRESET_EXAMPLES_MAX} entries`]);
  });

  it('lists the catalog presets that still have no example', () => {
    expect(
      presetsWithoutExample([
        { examples: [picture], key: 'a' },
        { examples: [], key: 'b' },
      ]),
    ).toEqual(['b']);
  });
});
