import { describe, expect, it } from 'vitest';
import { starterThumbnail } from './starter-thumbnail.helper';

describe('starterThumbnail', () => {
  it.each([
    [
      'turbo',
      'weeklyMix',
      'https://cdn.genfeed.ai/assets/starters/turbo/weeklyMix.webp',
    ],
    [
      'editor',
      'portrait',
      'https://cdn.genfeed.ai/assets/starters/editor/portrait.webp',
    ],
    [
      'storyboard',
      'voiceNote',
      'https://cdn.genfeed.ai/assets/starters/storyboard/voiceNote.webp',
    ],
  ] as const)('%s/%s resolves to %s', (app, id, expected) => {
    expect(starterThumbnail(app, id)).toBe(expected);
  });
});
