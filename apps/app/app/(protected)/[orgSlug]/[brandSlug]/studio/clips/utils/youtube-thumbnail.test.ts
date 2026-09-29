import { describe, expect, it } from 'vitest';

import { clipProjectTitle, extractYoutubeVideoId } from './youtube-thumbnail';

describe('youtube thumbnail helpers', () => {
  it('extracts a short URL id', () => {
    expect(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    );
  });

  it('falls back to a readable title', () => {
    expect(clipProjectTitle('Podcast ep 12', undefined)).toBe('Podcast ep 12');
    expect(clipProjectTitle(undefined, 'https://youtu.be/dQw4w9WgXcQ')).toBe(
      'YouTube · dQw4w9WgXcQ',
    );
    expect(clipProjectTitle(undefined, undefined)).toBe('Untitled project');
  });
});
