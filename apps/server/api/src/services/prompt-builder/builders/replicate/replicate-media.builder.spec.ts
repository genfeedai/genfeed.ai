import type { ConfigService } from '@api/config/config.service';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import { ModelCategory, ModelKey, ModelProvider } from '@genfeedai/enums';
import { ReplicateMediaBuilder } from './replicate-media.builder';

describe('ReplicateMediaBuilder', () => {
  let builder: ReplicateMediaBuilder;

  beforeEach(() => {
    const configService = {} as ConfigService;
    builder = new ReplicateMediaBuilder(configService);
  });

  it('should be defined', () => {
    expect(builder).toBeDefined();
  });

  describe('getProvider', () => {
    it('should return REPLICATE', () => {
      expect(builder.getProvider()).toBe(ModelProvider.REPLICATE);
    });
  });

  describe('getSupportedModels', () => {
    it('should include MusicGen', () => {
      expect(builder.getSupportedModels()).toContain(
        ModelKey.REPLICATE_META_MUSICGEN,
      );
    });

    it('should include Topaz Image Upscale', () => {
      expect(builder.getSupportedModels()).toContain(
        ModelKey.REPLICATE_TOPAZ_IMAGE_UPSCALE,
      );
    });

    it('should include Topaz Video Upscale', () => {
      expect(builder.getSupportedModels()).toContain(
        ModelKey.REPLICATE_TOPAZ_VIDEO_UPSCALE,
      );
    });

    it('should support all listed models', () => {
      for (const model of builder.getSupportedModels()) {
        expect(builder.supportsModel(model)).toBe(true);
      }
    });
  });

  describe('buildPrompt - MusicGen', () => {
    const baseParams: PromptBuilderParams = {
      modelCategory: ModelCategory.AUDIO,
      prompt: 'upbeat electronic music',
    };

    it('should build MusicGen prompt with defaults', () => {
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_META_MUSICGEN,
        baseParams,
        'upbeat electronic music',
      );

      expect(result).toMatchObject({
        duration: 8,
        model_version: 'stereo-large',
        output_format: 'mp3',
        prompt: 'upbeat electronic music',
        temperature: 1,
      });
    });

    it('should use custom duration', () => {
      const params = { ...baseParams, duration: 15 };
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_META_MUSICGEN,
        params,
        'chill beats',
      );

      expect(result).toHaveProperty('duration', 15);
    });

    it('should use custom seed', () => {
      const params = { ...baseParams, seed: 42 };
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_META_MUSICGEN,
        params,
        'music',
      );

      expect(result).toHaveProperty('seed', 42);
    });

    it('should default seed to -1', () => {
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_META_MUSICGEN,
        baseParams,
        'music',
      );

      expect(result).toHaveProperty('seed', -1);
    });
  });

  describe('buildPrompt - Topaz Image Upscale', () => {
    const baseParams: PromptBuilderParams = {
      modelCategory: ModelCategory.IMAGE,
      prompt: '',
      references: ['https://example.com/image.jpg'],
    };

    it('should build Topaz Image Upscale prompt with defaults', () => {
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        baseParams,
        '',
      );

      expect(result).toMatchObject({
        face_enhancement: true,
        image: 'https://example.com/image.jpg',
        output_format: 'jpg',
        upscale_factor: '4x',
      });
    });

    it('should use custom enhance model', () => {
      const params = { ...baseParams, enhanceModel: 'High Fidelity V2' };
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        params,
        '',
      );

      expect(result).toHaveProperty('enhance_model', 'High Fidelity V2');
    });

    it('should disable face enhancement when set to false', () => {
      const params = { ...baseParams, faceEnhancement: false };
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        params,
        '',
      );

      expect(result).toHaveProperty('face_enhancement', false);
    });

    it('should use custom upscale factor', () => {
      const params = { ...baseParams, upscaleFactor: '2x' };
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        params,
        '',
      );

      expect(result).toHaveProperty('upscale_factor', '2x');
    });
  });

  describe('buildPrompt - Topaz Video Upscale', () => {
    const baseParams: PromptBuilderParams = {
      modelCategory: ModelCategory.VIDEO,
      prompt: '',
      target_fps: 60,
      target_resolution: '4k',
      video: 'https://example.com/video.mp4',
    };

    it('should build Topaz Video Upscale prompt', () => {
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        baseParams,
        '',
      );

      expect(result).toMatchObject({
        target_fps: 60,
        target_resolution: '4k',
        video: 'https://example.com/video.mp4',
      });
    });

    it('should handle missing optional params', () => {
      const params: PromptBuilderParams = {
        modelCategory: ModelCategory.VIDEO,
        prompt: '',
      };

      const result = builder.buildPrompt(
        ModelKey.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        params,
        '',
      );

      expect(result).toHaveProperty('video', undefined);
      expect(result).toHaveProperty('target_fps', undefined);
    });
  });

  describe('buildPrompt - unsupported model', () => {
    it('should throw for unsupported model', () => {
      expect(() =>
        builder.buildPrompt(
          ModelKey.REPLICATE_OPENAI_SORA_2,
          { modelCategory: ModelCategory.VIDEO, prompt: '' },
          'test',
        ),
      ).toThrow('Unsupported media model');
    });
  });
});
