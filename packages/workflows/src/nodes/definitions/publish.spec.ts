import { describe, expect, it } from 'vitest';
import { DEFAULT_PUBLISH_DATA } from './publish';

describe('publish node', () => {
  describe('DEFAULT_PUBLISH_DATA', () => {
    it('should default output arrays to empty', () => {
      expect(DEFAULT_PUBLISH_DATA.createdPostIds).toEqual([]);
      expect(DEFAULT_PUBLISH_DATA.publishedUrls).toEqual([]);
      expect(DEFAULT_PUBLISH_DATA.hashtags).toEqual([]);
    });
  });
});
