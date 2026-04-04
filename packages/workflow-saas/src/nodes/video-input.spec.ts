import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIDEO_INPUT_DATA,
  videoInputNodeDefinition,
} from './video-input';

describe('video-input node', () => {
  describe('DEFAULT_VIDEO_INPUT_DATA', () => {
    it('should have label set to Video Input', () => {
      expect(DEFAULT_VIDEO_INPUT_DATA.label).toBe('Video Input');
    });

    it('should default to idle status', () => {
      expect(DEFAULT_VIDEO_INPUT_DATA.status).toBe('idle');
    });

    it('should default maxVideos to 10', () => {
      expect(DEFAULT_VIDEO_INPUT_DATA.maxVideos).toBe(10);
    });

    it('should default minClipDuration to 0.5', () => {
      expect(DEFAULT_VIDEO_INPUT_DATA.minClipDuration).toBe(0.5);
    });

    it('should default videoUrls and videoFiles to empty arrays', () => {
      expect(DEFAULT_VIDEO_INPUT_DATA.videoUrls).toEqual([]);
      expect(DEFAULT_VIDEO_INPUT_DATA.videoFiles).toEqual([]);
    });

    it('should default validationErrors to empty array', () => {
      expect(DEFAULT_VIDEO_INPUT_DATA.validationErrors).toEqual([]);
    });

    it('should default totalDuration and videoCount to null', () => {
      expect(DEFAULT_VIDEO_INPUT_DATA.totalDuration).toBeNull();
      expect(DEFAULT_VIDEO_INPUT_DATA.videoCount).toBeNull();
    });
  });

  describe('videoInputNodeDefinition', () => {
    it('should have type videoInput', () => {
      expect(videoInputNodeDefinition.type).toBe('videoInput');
    });

    it('should be in input category', () => {
      expect(videoInputNodeDefinition.category).toBe('input');
    });

    it('should have label Video Input', () => {
      expect(videoInputNodeDefinition.label).toBe('Video Input');
    });

    it('should have a description', () => {
      expect(videoInputNodeDefinition.description).toBeTruthy();
    });

    it('should require videoUrls input as multiple', () => {
      const input = videoInputNodeDefinition.inputs.find(
        (i) => i.id === 'videoUrls',
      );
      expect(input).toBeDefined();
      expect(input?.required).toBe(true);
      expect(input?.multiple).toBe(true);
    });

    it('should have videoFiles, totalDuration, and videoCount outputs', () => {
      const outputIds = videoInputNodeDefinition.outputs.map((o) => o.id);
      expect(outputIds).toContain('videoFiles');
      expect(outputIds).toContain('totalDuration');
      expect(outputIds).toContain('videoCount');
    });

    it('should reference default data', () => {
      expect(videoInputNodeDefinition.defaultData).toBe(
        DEFAULT_VIDEO_INPUT_DATA,
      );
    });
  });
});
