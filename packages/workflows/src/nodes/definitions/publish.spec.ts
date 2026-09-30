import { describe, expect, it } from 'vitest';
import { DEFAULT_PUBLISH_DATA } from './publish';

describe('publish node', () => {
  describe('DEFAULT_PUBLISH_DATA', () => {
    it('should have label set to Publish', () => {
      expect(DEFAULT_PUBLISH_DATA.label).toBe('Publish');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_PUBLISH_DATA.status).toBe('idle');
    });

    it('should have type set to publish', () => {
      expect(DEFAULT_PUBLISH_DATA.type).toBe('publish');
    });

    it('should default to no selected platforms', () => {
      expect(DEFAULT_PUBLISH_DATA.platforms).toEqual([]);
    });

    it('should default schedule to immediate', () => {
      expect(DEFAULT_PUBLISH_DATA.schedule).toEqual({ type: 'immediate' });
    });

    it('should default input references to null', () => {
      expect(DEFAULT_PUBLISH_DATA.inputBrandId).toBeNull();
      expect(DEFAULT_PUBLISH_DATA.inputMediaId).toBeNull();
      expect(DEFAULT_PUBLISH_DATA.inputCaption).toBeNull();
      expect(DEFAULT_PUBLISH_DATA.inputSchedule).toBeNull();
    });

    it('should default output arrays to empty', () => {
      expect(DEFAULT_PUBLISH_DATA.createdPostIds).toEqual([]);
      expect(DEFAULT_PUBLISH_DATA.publishedUrls).toEqual([]);
      expect(DEFAULT_PUBLISH_DATA.hashtags).toEqual([]);
    });

    it('should default caption to empty string', () => {
      expect(DEFAULT_PUBLISH_DATA.caption).toBe('');
    });
  });
});
