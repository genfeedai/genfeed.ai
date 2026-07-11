import { describe, expect, it } from 'vitest';
import { DEFAULT_PUBLISH_DATA, publishNodeDefinition } from './publish';

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

    it('should default all platforms to false', () => {
      expect(DEFAULT_PUBLISH_DATA.platforms).toEqual({
        instagram: false,
        linkedin: false,
        tiktok: false,
        twitter: false,
      });
    });

    it('should default schedule to immediate', () => {
      expect(DEFAULT_PUBLISH_DATA.schedule).toEqual({ type: 'immediate' });
    });

    it('should default input references to null', () => {
      expect(DEFAULT_PUBLISH_DATA.inputBrandId).toBeNull();
      expect(DEFAULT_PUBLISH_DATA.inputMediaId).toBeNull();
      expect(DEFAULT_PUBLISH_DATA.inputCaption).toBeNull();
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

  describe('publishNodeDefinition', () => {
    it('should have type publish', () => {
      expect(publishNodeDefinition.type).toBe('publish');
    });

    it('should be in output category', () => {
      expect(publishNodeDefinition.category).toBe('output');
    });

    it('should have label Publish', () => {
      expect(publishNodeDefinition.label).toBe('Publish');
    });

    it('should have a description', () => {
      expect(publishNodeDefinition.description).toBeTruthy();
    });

    it('should have an icon', () => {
      expect(publishNodeDefinition.icon).toBe('Share2');
    });

    it('should require brand and media inputs', () => {
      const brandInput = publishNodeDefinition.inputs.find(
        (i) => i.id === 'brand',
      );
      const mediaInput = publishNodeDefinition.inputs.find(
        (i) => i.id === 'media',
      );
      expect(brandInput).toBeDefined();
      expect(brandInput?.required).toBe(true);
      expect(mediaInput).toBeDefined();
      expect(mediaInput?.required).toBe(true);
    });

    it('should have optional caption input', () => {
      const captionInput = publishNodeDefinition.inputs.find(
        (i) => i.id === 'caption',
      );
      expect(captionInput).toBeDefined();
      expect(captionInput?.required).toBe(false);
    });

    it('should have no outputs', () => {
      expect(publishNodeDefinition.outputs).toEqual([]);
    });

    it('should reference default data', () => {
      expect(publishNodeDefinition.defaultData).toBe(DEFAULT_PUBLISH_DATA);
    });
  });
});
