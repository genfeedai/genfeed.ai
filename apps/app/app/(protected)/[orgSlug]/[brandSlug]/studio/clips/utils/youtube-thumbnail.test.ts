import { describe, expect, it } from 'vitest';

import {
  clipProjectTitle,
  extractYoutubeVideoId,
  youtubeThumbnailUrl,
} from './youtube-thumbnail';

describe('youtube thumbnail helpers', () => {
  it('extracts a watch URL id', () => {
    expect(
      extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe('dQw4w9WgXcQ');
  });

  it('extracts a short URL id', () => {
    expect(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    );
  });

  it('builds a hqdefault thumbnail', () => {
    expect(
      youtubeThumbnailUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });

  it('falls back to a readable title', () => {
    expect(clipProjectTitle('Podcast ep 12', undefined)).toBe('Podcast ep 12');
    expect(clipProjectTitle(undefined, 'https://youtu.be/dQw4w9WgXcQ')).toBe(
      'YouTube · dQw4w9WgXcQ',
    );
    expect(clipProjectTitle(undefined, undefined)).toBe('Untitled project');
  });
});
