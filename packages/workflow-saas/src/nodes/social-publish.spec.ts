import { describe, expect, it } from 'vitest';
import {
  defaultSocialPublishData,
  socialPublishNodeDefinition,
} from './social-publish';

describe('social-publish node', () => {
  describe('defaultSocialPublishData', () => {
    it('should have label set to Social Publish', () => {
      expect(defaultSocialPublishData.label).toBe('Social Publish');
    });

    it('should default to idle status', () => {
      expect(defaultSocialPublishData.status).toBe('idle');
    });

    it('should default platform to youtube', () => {
      expect(defaultSocialPublishData.platform).toBe('youtube');
    });

    it('should default visibility to public', () => {
      expect(defaultSocialPublishData.visibility).toBe('public');
    });

    it('should default tags to empty array', () => {
      expect(defaultSocialPublishData.tags).toEqual([]);
    });

    it('should default input and output references to null', () => {
      expect(defaultSocialPublishData.inputVideo).toBeNull();
      expect(defaultSocialPublishData.publishedUrl).toBeNull();
      expect(defaultSocialPublishData.jobId).toBeNull();
      expect(defaultSocialPublishData.scheduledTime).toBeNull();
    });

    it('should default title and description to empty string', () => {
      expect(defaultSocialPublishData.title).toBe('');
      expect(defaultSocialPublishData.description).toBe('');
    });
  });

  describe('socialPublishNodeDefinition', () => {
    it('should have type socialPublish', () => {
      expect(socialPublishNodeDefinition.type).toBe('socialPublish');
    });

    it('should be in output category', () => {
      expect(socialPublishNodeDefinition.category).toBe('output');
    });

    it('should have label Social Publish', () => {
      expect(socialPublishNodeDefinition.label).toBe('Social Publish');
    });

    it('should have a description mentioning supported platforms', () => {
      expect(socialPublishNodeDefinition.description).toContain('YouTube');
    });

    it('should require video input', () => {
      expect(socialPublishNodeDefinition.inputs).toHaveLength(1);
      const videoInput = socialPublishNodeDefinition.inputs[0];
      expect(videoInput.id).toBe('video');
      expect(videoInput.required).toBe(true);
      expect(videoInput.type).toBe('video');
    });

    it('should have no outputs', () => {
      expect(socialPublishNodeDefinition.outputs).toEqual([]);
    });

    it('should reference default data', () => {
      expect(socialPublishNodeDefinition.defaultData).toBe(
        defaultSocialPublishData,
      );
    });
  });
});
