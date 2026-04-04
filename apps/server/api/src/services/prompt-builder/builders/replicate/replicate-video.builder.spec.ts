import type { ConfigService } from '@api/config/config.service';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import { ModelCategory, ModelKey, ModelProvider } from '@genfeedai/enums';
import { ReplicateVideoBuilder } from './replicate-video.builder';

function createConfigService(isDev = false): ConfigService {
  return {
    get: vi.fn(),
    isDevelopment: isDev,
  } as unknown as ConfigService;
}

describe('ReplicateVideoBuilder', () => {
  let builder: ReplicateVideoBuilder;
  let configService: ConfigService;

  beforeEach(() => {
    configService = createConfigService(false);
    builder = new ReplicateVideoBuilder(configService);
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
    it('should include Sora models', () => {
      const models = builder.getSupportedModels();
      expect(models).toContain(ModelKey.REPLICATE_OPENAI_SORA_2);
      expect(models).toContain(ModelKey.REPLICATE_OPENAI_SORA_2_PRO);
    });

    it('should include Veo models', () => {
      const models = builder.getSupportedModels();
      expect(models).toContain(ModelKey.REPLICATE_GOOGLE_VEO_2);
      expect(models).toContain(ModelKey.REPLICATE_GOOGLE_VEO_3);
      expect(models).toContain(ModelKey.REPLICATE_GOOGLE_VEO_3_1);
      expect(models).toContain(ModelKey.REPLICATE_GOOGLE_VEO_3_1_FAST);
    });

    it('should include Kling models', () => {
      const models = builder.getSupportedModels();
      expect(models).toContain(ModelKey.REPLICATE_KWAIVGI_KLING_V2_1);
      expect(models).toContain(ModelKey.REPLICATE_KWAIVGI_KLING_V3_VIDEO);
      expect(models).toContain(ModelKey.REPLICATE_KWAIVGI_KLING_AVATAR_V2);
    });
  });

  describe('buildPrompt - Sora 2', () => {
    const baseParams: PromptBuilderParams = {
      modelCategory: ModelCategory.VIDEO,
      prompt: 'A sunset over the ocean',
    };

    it('should build Sora 2 prompt', () => {
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_OPENAI_SORA_2,
        baseParams,
        'A sunset over the ocean',
      );

      expect(result).toHaveProperty('prompt', 'A sunset over the ocean');
      expect(result).toHaveProperty('aspect_ratio');
      expect(result).toHaveProperty('seconds');
    });

    it('should include reference image', () => {
      const params = {
        ...baseParams,
        references: ['https://example.com/ref.jpg'],
      };
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_OPENAI_SORA_2,
        params,
        'test',
      );

      expect(result).toHaveProperty(
        'input_reference',
        'https://example.com/ref.jpg',
      );
    });
  });

  describe('buildPrompt - Sora 2 Pro', () => {
    const baseParams: PromptBuilderParams = {
      modelCategory: ModelCategory.VIDEO,
      prompt: 'test',
    };

    it('should build with default resolution', () => {
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_OPENAI_SORA_2_PRO,
        baseParams,
        'test',
      );

      expect(result).toHaveProperty('resolution', 'standard');
    });

    it('should accept "high" resolution', () => {
      const params = { ...baseParams, resolution: 'high' };
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_OPENAI_SORA_2_PRO,
        params,
        'test',
      );

      expect(result).toHaveProperty('resolution', 'high');
    });

    it('should fallback invalid resolution to standard', () => {
      const params = { ...baseParams, resolution: 'ultra' };
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_OPENAI_SORA_2_PRO,
        params,
        'test',
      );

      expect(result).toHaveProperty('resolution', 'standard');
    });
  });

  describe('buildPrompt - Veo 2', () => {
    const baseParams: PromptBuilderParams = {
      modelCategory: ModelCategory.VIDEO,
      prompt: 'test',
    };

    it('should build with defaults', () => {
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_GOOGLE_VEO_2,
        baseParams,
        'A dancing robot',
      );

      expect(result).toMatchObject({
        duration: 5,
        prompt: 'A dancing robot',
        seed: -1,
      });
    });

    it('should include image reference', () => {
      const params = { ...baseParams, references: ['ref.jpg'] };
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_GOOGLE_VEO_2,
        params,
        'test',
      );

      expect(result).toHaveProperty('image', 'ref.jpg');
    });
  });

  describe('buildPrompt - Veo 3', () => {
    const baseParams: PromptBuilderParams = {
      modelCategory: ModelCategory.VIDEO,
      prompt: 'test',
    };

    it('should build with audio generation enabled by default', () => {
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_GOOGLE_VEO_3,
        baseParams,
        'test',
      );

      expect(result).toHaveProperty('generate_audio', true);
      expect(result).toHaveProperty('duration', 8);
      expect(result).toHaveProperty('resolution', '720p');
    });

    it('should respect isAudioEnabled flag', () => {
      const params = { ...baseParams, isAudioEnabled: false };
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_GOOGLE_VEO_3,
        params,
        'test',
      );

      expect(result).toHaveProperty('generate_audio', false);
    });

    it('should include negative prompt from blacklist', () => {
      const params = { ...baseParams, blacklist: ['nsfw', 'violence'] };
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_GOOGLE_VEO_3,
        params,
        'test',
      );

      expect(result).toHaveProperty('negative_prompt', 'nsfw,violence');
    });
  });

  describe('buildPrompt - Veo 3.1', () => {
    const baseParams: PromptBuilderParams = {
      modelCategory: ModelCategory.VIDEO,
      prompt: 'test',
    };

    it('should default resolution to 1080p in production', () => {
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_GOOGLE_VEO_3_1,
        baseParams,
        'test',
      );

      expect(result).toHaveProperty('resolution', '1080p');
    });

    it('should default resolution to 720p in development', () => {
      const devBuilder = new ReplicateVideoBuilder(createConfigService(true));
      const result = devBuilder.buildPrompt(
        ModelKey.REPLICATE_GOOGLE_VEO_3_1,
        baseParams,
        'test',
      );

      expect(result).toHaveProperty('resolution', '720p');
    });

    it('should include reference images for R2V', () => {
      const params = {
        ...baseParams,
        references: ['ref1.jpg', 'ref2.jpg', 'ref3.jpg'],
      };
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_GOOGLE_VEO_3_1,
        params,
        'test',
      );

      expect(result).toHaveProperty('reference_images');
      expect((result as Record<string, unknown>).reference_images).toHaveLength(
        3,
      );
    });

    it('should use single image for I2V', () => {
      const params = { ...baseParams, references: ['ref1.jpg'] };
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_GOOGLE_VEO_3_1,
        params,
        'test',
      );

      expect(result).toHaveProperty('image', 'ref1.jpg');
      expect(result).not.toHaveProperty('reference_images');
    });

    it('should include last_frame for interpolation', () => {
      const params = {
        ...baseParams,
        endFrame: 'end.jpg',
        references: ['ref1.jpg'],
      };
      const result = builder.buildPrompt(
        ModelKey.REPLICATE_GOOGLE_VEO_3_1,
        params,
        'test',
      );

      expect(result).toHaveProperty('last_frame', 'end.jpg');
    });
  });

  describe('buildPrompt - WAN Video', () => {
    it('should require a reference image', () => {
      const params: PromptBuilderParams = {
        modelCategory: ModelCategory.VIDEO,
        prompt: 'test',
      };

      expect(() =>
        builder.buildPrompt(
          ModelKey.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
          params,
          'test',
        ),
      ).toThrow('image is required for WAN Video');
    });

    it('should build with reference image', () => {
      const params: PromptBuilderParams = {
        modelCategory: ModelCategory.VIDEO,
        prompt: 'test',
        references: ['https://example.com/img.jpg'],
      };

      const result = builder.buildPrompt(
        ModelKey.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
        params,
        'test',
      );

      expect(result).toHaveProperty('image', 'https://example.com/img.jpg');
      expect(result).toHaveProperty('go_fast', true);
      expect(result).toHaveProperty('frames_per_second', 16);
    });
  });

  describe('buildPrompt - Kling V2.1', () => {
    it('should require reference image', () => {
      const params: PromptBuilderParams = {
        modelCategory: ModelCategory.VIDEO,
        prompt: 'test',
      };

      expect(() =>
        builder.buildPrompt(
          ModelKey.REPLICATE_KWAIVGI_KLING_V2_1,
          params,
          'test',
        ),
      ).toThrow('start_image is required for Kling V2.1');
    });

    it('should build with reference and default duration', () => {
      const params: PromptBuilderParams = {
        modelCategory: ModelCategory.VIDEO,
        prompt: 'test',
        references: ['ref.jpg'],
      };

      const result = builder.buildPrompt(
        ModelKey.REPLICATE_KWAIVGI_KLING_V2_1,
        params,
        'test',
      );

      expect(result).toHaveProperty('start_image', 'ref.jpg');
      expect(result).toHaveProperty('duration', 5);
      expect(result).toHaveProperty('mode', 'standard');
    });

    it('should use pro mode when endFrame provided', () => {
      const params: PromptBuilderParams = {
        endFrame: 'end.jpg',
        modelCategory: ModelCategory.VIDEO,
        prompt: 'test',
        references: ['ref.jpg'],
      };

      const result = builder.buildPrompt(
        ModelKey.REPLICATE_KWAIVGI_KLING_V2_1,
        params,
        'test',
      );

      expect(result).toHaveProperty('mode', 'pro');
      expect(result).toHaveProperty('end_image', 'end.jpg');
    });
  });

  describe('buildPrompt - Kling Avatar V2', () => {
    it('should require portrait image', () => {
      const params: PromptBuilderParams = {
        audioUrl: 'audio.mp3',
        modelCategory: ModelCategory.VIDEO,
        prompt: 'test',
      };

      expect(() =>
        builder.buildPrompt(
          ModelKey.REPLICATE_KWAIVGI_KLING_AVATAR_V2,
          params,
          'test',
        ),
      ).toThrow('Portrait image is required for Kling Avatar V2');
    });

    it('should require audio URL', () => {
      const params: PromptBuilderParams = {
        modelCategory: ModelCategory.VIDEO,
        prompt: 'test',
        references: ['portrait.jpg'],
      };

      expect(() =>
        builder.buildPrompt(
          ModelKey.REPLICATE_KWAIVGI_KLING_AVATAR_V2,
          params,
          'test',
        ),
      ).toThrow('Audio file is required for Kling Avatar V2');
    });

    it('should build with image and audio', () => {
      const params: PromptBuilderParams = {
        audioUrl: 'audio.mp3',
        modelCategory: ModelCategory.VIDEO,
        prompt: '',
        references: ['portrait.jpg'],
      };

      const result = builder.buildPrompt(
        ModelKey.REPLICATE_KWAIVGI_KLING_AVATAR_V2,
        params,
        'Say hello',
      );

      expect(result).toHaveProperty('image', 'portrait.jpg');
      expect(result).toHaveProperty('audio', 'audio.mp3');
      expect(result).toHaveProperty('prompt', 'Say hello');
    });
  });

  describe('buildPrompt - Kling V3', () => {
    it('should use pro mode in production', () => {
      const params: PromptBuilderParams = {
        modelCategory: ModelCategory.VIDEO,
        prompt: 'test',
      };

      const result = builder.buildPrompt(
        ModelKey.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
        params,
        'test',
      );

      expect(result).toHaveProperty('mode', 'pro');
    });

    it('should use standard mode in development', () => {
      const devBuilder = new ReplicateVideoBuilder(createConfigService(true));
      const params: PromptBuilderParams = {
        modelCategory: ModelCategory.VIDEO,
        prompt: 'test',
      };

      const result = devBuilder.buildPrompt(
        ModelKey.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
        params,
        'test',
      );

      expect(result).toHaveProperty('mode', 'standard');
    });

    it('should clamp duration between 3 and 15', () => {
      const params: PromptBuilderParams = {
        duration: 30,
        modelCategory: ModelCategory.VIDEO,
        prompt: 'test',
      };

      const result = builder.buildPrompt(
        ModelKey.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
        params,
        'test',
      );

      expect(result).toHaveProperty('duration', 15);
    });
  });

  describe('buildPrompt - unsupported model', () => {
    it('should throw for unsupported model', () => {
      expect(() =>
        builder.buildPrompt(
          ModelKey.REPLICATE_META_MUSICGEN,
          { modelCategory: ModelCategory.VIDEO, prompt: '' },
          'test',
        ),
      ).toThrow('Unsupported video model');
    });
  });
});
