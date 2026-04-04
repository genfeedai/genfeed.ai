import { describe, expect, it } from 'vitest';
import {
  ImageTaskModel,
  MusicTaskModel,
  VideoTaskModel,
} from '../src/task-model.enum';

describe('task-model.enum', () => {
  describe('ImageTaskModel', () => {
    it('should have 6 members', () => {
      expect(Object.values(ImageTaskModel)).toHaveLength(6);
    });

    it('should have correct values', () => {
      expect(ImageTaskModel.IMAGEN4).toBe('imagen4');
      expect(ImageTaskModel.LEONARDO).toBe('leonardo');
      expect(ImageTaskModel.SDXL).toBe('sdxl');
      expect(ImageTaskModel.REPLICATE).toBe('replicate');
      expect(ImageTaskModel.FAL).toBe('fal');
      expect(ImageTaskModel.COMFYUI).toBe('comfyui');
    });
  });

  describe('VideoTaskModel', () => {
    it('should have 8 members', () => {
      expect(Object.values(VideoTaskModel)).toHaveLength(8);
    });

    it('should have correct values', () => {
      expect(VideoTaskModel.KLINGAI).toBe('klingai');
      expect(VideoTaskModel.RUNWAY).toBe('runway');
      expect(VideoTaskModel.HEDRA).toBe('hedra');
      expect(VideoTaskModel.REPLICATE).toBe('replicate');
      expect(VideoTaskModel.VEO3).toBe('veo3');
      expect(VideoTaskModel.FAL).toBe('fal');
      expect(VideoTaskModel.COMFYUI).toBe('comfyui');
      expect(VideoTaskModel.HIGGSFIELD).toBe('higgsfield');
    });
  });

  describe('MusicTaskModel', () => {
    it('should have 4 members', () => {
      expect(Object.values(MusicTaskModel)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(MusicTaskModel.MUSICGEN).toBe('musicgen');
      expect(MusicTaskModel.RIFFUSION).toBe('riffusion');
      expect(MusicTaskModel.ELEVENLABS).toBe('elevenlabs');
      expect(MusicTaskModel.REPLICATE).toBe('replicate');
    });
  });
});
