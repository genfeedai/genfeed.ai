import { describe, expect, it } from 'vitest';
import {
  toYouTubeChannelStartUrl,
  toYouTubeVideoUrl,
} from './youtube-reply-url.util';

describe('youtube-reply-url.util', () => {
  describe('toYouTubeChannelStartUrl', () => {
    it('passes through full URLs', () => {
      expect(toYouTubeChannelStartUrl('https://www.youtube.com/@brand')).toBe(
        'https://www.youtube.com/@brand',
      );
    });

    it('maps UC channel ids to /channel/ URLs', () => {
      expect(toYouTubeChannelStartUrl('UCabcdefghijklmnopqrstuv')).toBe(
        'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv',
      );
    });

    it('maps handles to /@handle URLs', () => {
      expect(toYouTubeChannelStartUrl('brandchannel')).toBe(
        'https://www.youtube.com/@brandchannel',
      );
      expect(toYouTubeChannelStartUrl('@brandchannel')).toBe(
        'https://www.youtube.com/@brandchannel',
      );
    });

    it('returns empty for blank input', () => {
      expect(toYouTubeChannelStartUrl('')).toBe('');
      expect(toYouTubeChannelStartUrl(null)).toBe('');
    });
  });

  describe('toYouTubeVideoUrl', () => {
    it('prefers youtube contentUrl', () => {
      expect(
        toYouTubeVideoUrl({
          contentUrl: 'https://www.youtube.com/watch?v=abc123',
          id: 'other',
        }),
      ).toBe('https://www.youtube.com/watch?v=abc123');
    });

    it('builds watch URL from bare video id', () => {
      expect(toYouTubeVideoUrl({ id: 'dQw4w9WgXcQ' })).toBe(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
    });
  });
});
