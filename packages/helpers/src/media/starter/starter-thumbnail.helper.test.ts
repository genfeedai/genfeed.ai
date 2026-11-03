import { describe, expect, it } from 'vitest';
import { starterThumbnail } from './starter-thumbnail.helper';

describe('starterThumbnail', () => {
  it.each([
    ['turbo', 'weeklyMix', '/starters/turbo/weeklyMix.webp'],
    ['editor', 'portrait', '/starters/editor/portrait.webp'],
    ['storyboard', 'voiceNote', '/starters/storyboard/voiceNote.webp'],
  ] as const)('%s/%s resolves to %s', (app, id, expected) => {
    expect(starterThumbnail(app, id)).toBe(expected);
  });
});
