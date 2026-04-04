import { describe, expect, it } from 'vitest';

import { getMediaFromNode } from './mediaExtraction';

describe('getMediaFromNode', () => {
  describe('imageGen', () => {
    it('returns image with outputImage and outputImages', () => {
      const data = {
        outputImage: 'https://example.com/img.png',
        outputImages: [
          'https://example.com/a.png',
          'https://example.com/b.png',
        ],
      } as any;
      const result = getMediaFromNode('imageGen', data);
      expect(result.url).toBe('https://example.com/img.png');
      expect(result.urls).toEqual([
        'https://example.com/a.png',
        'https://example.com/b.png',
      ]);
      expect(result.type).toBe('image');
    });

    it('returns image with outputImage only and empty urls', () => {
      const data = {
        outputImage: 'https://example.com/img.png',
      } as any;
      const result = getMediaFromNode('imageGen', data);
      expect(result.url).toBe('https://example.com/img.png');
      expect(result.urls).toEqual([]);
      expect(result.type).toBe('image');
    });

    it('returns null type when neither outputImage nor outputImages', () => {
      const data = {} as any;
      const result = getMediaFromNode('imageGen', data);
      expect(result.url).toBeUndefined();
      expect(result.urls).toEqual([]);
      expect(result.type).toBeNull();
    });
  });

  describe('videoGen', () => {
    it('returns video with outputVideo', () => {
      const data = { outputVideo: 'https://example.com/vid.mp4' } as any;
      const result = getMediaFromNode('videoGen', data);
      expect(result.url).toBe('https://example.com/vid.mp4');
      expect(result.type).toBe('video');
    });

    it('returns null type without outputVideo', () => {
      const data = {} as any;
      const result = getMediaFromNode('videoGen', data);
      expect(result.url).toBeUndefined();
      expect(result.type).toBeNull();
    });
  });

  describe('imageInput', () => {
    it('returns image with image property', () => {
      const data = { image: 'https://example.com/input.png' } as any;
      const result = getMediaFromNode('imageInput', data);
      expect(result.url).toBe('https://example.com/input.png');
      expect(result.type).toBe('image');
    });

    it('returns null type without image property', () => {
      const data = {} as any;
      const result = getMediaFromNode('imageInput', data);
      expect(result.url).toBeUndefined();
      expect(result.type).toBeNull();
    });
  });

  describe('videoInput', () => {
    it('returns video with video property', () => {
      const data = { video: 'https://example.com/input.mp4' } as any;
      const result = getMediaFromNode('videoInput', data);
      expect(result.url).toBe('https://example.com/input.mp4');
      expect(result.type).toBe('video');
    });

    it('returns null type without video property', () => {
      const data = {} as any;
      const result = getMediaFromNode('videoInput', data);
      expect(result.url).toBeUndefined();
      expect(result.type).toBeNull();
    });
  });

  describe('motionControl', () => {
    it('returns video with outputVideo', () => {
      const data = { outputVideo: 'https://example.com/motion.mp4' } as any;
      const result = getMediaFromNode('motionControl', data);
      expect(result.url).toBe('https://example.com/motion.mp4');
      expect(result.type).toBe('video');
    });

    it('returns null type without outputVideo', () => {
      const data = {} as any;
      const result = getMediaFromNode('motionControl', data);
      expect(result.url).toBeUndefined();
      expect(result.type).toBeNull();
    });
  });

  describe('download', () => {
    it('returns video when inputVideo is present', () => {
      const data = { inputVideo: 'https://example.com/dl.mp4' } as any;
      const result = getMediaFromNode('download', data);
      expect(result.url).toBe('https://example.com/dl.mp4');
      expect(result.type).toBe('video');
    });

    it('returns image when inputImage is present and no inputVideo', () => {
      const data = { inputImage: 'https://example.com/dl.png' } as any;
      const result = getMediaFromNode('download', data);
      expect(result.url).toBe('https://example.com/dl.png');
      expect(result.type).toBe('image');
    });

    it('returns null when neither inputVideo nor inputImage', () => {
      const data = {} as any;
      const result = getMediaFromNode('download', data);
      expect(result.url).toBeNull();
      expect(result.type).toBeNull();
    });
  });

  describe('unknown node type', () => {
    it('returns null for unknown node type', () => {
      const data = {} as any;
      const result = getMediaFromNode('unknownType' as any, data);
      expect(result.url).toBeNull();
      expect(result.type).toBeNull();
    });
  });
});
