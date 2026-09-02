import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import { ErrorCode, ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { ConfigService } from '@libs/config/config.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ReplicateVideoBuilder } from './replicate-video.builder';

function expectRequiredFieldValidation(
  act: () => unknown,
  field: string,
): HttpException {
  let thrown: unknown;
  try {
    act();
  } catch (error: unknown) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(HttpException);
  const httpError = thrown as HttpException;
  expect(httpError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  expect(httpError.getResponse()).toEqual(
    expect.objectContaining({
      code: ErrorCode.VALIDATION_FAILED,
      detail: expect.stringContaining(field),
      status: HttpStatus.BAD_REQUEST,
      title: 'Validation failed',
      validationErrors: expect.arrayContaining([
        expect.objectContaining({
          field,
          message: expect.stringContaining(field),
        }),
      ]),
    }),
  );
  return httpError;
}

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
      expect(models).toContain(MODEL_KEYS.REPLICATE_OPENAI_SORA_2);
      expect(models).toContain(MODEL_KEYS.REPLICATE_OPENAI_SORA_2_PRO);
    });

    it('should include Veo models', () => {
      const models = builder.getSupportedModels();
      expect(models).toContain(MODEL_KEYS.REPLICATE_GOOGLE_VEO_2);
      expect(models).toContain(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3);
      expect(models).toContain(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1);
      expect(models).toContain(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST);
    });

    it('should include Kling models', () => {
      const models = builder.getSupportedModels();
      expect(models).toContain(MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1);
      expect(models).toContain(MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO);
      expect(models).toContain(MODEL_KEYS.REPLICATE_KWAIVGI_KLING_AVATAR_V2);
    });

    it('should include MiniMax H3', () => {
      expect(builder.getSupportedModels()).toContain(
        MODEL_KEYS.REPLICATE_MINIMAX_H3,
      );
    });

    it('should include Hailuo 2.3 Fast', () => {
      expect(builder.getSupportedModels()).toContain(
        MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
      );
    });
  });

  describe('buildPrompt - Hailuo 2.3 Fast', () => {
    const baseParams: PromptBuilderParams = {
      height: 1080,
      modelCategory: ModelCategory.VIDEO,
      prompt: 'A cinematic product reveal',
      width: 1920,
    };
    const firstFrame = 'https://cdn.example.com/first-frame.jpg';

    it('maps a valid first-frame reference onto first_frame_image', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
        { ...baseParams, references: [firstFrame] },
        'A cinematic product reveal',
      );

      expect(result).toEqual(
        expect.objectContaining({
          duration: 6,
          first_frame_image: firstFrame,
          prompt: 'A cinematic product reveal',
        }),
      );
      expect(result).not.toHaveProperty('image');
    });

    it('rejects a missing first-frame image with a named 4xx validation error', () => {
      expectRequiredFieldValidation(
        () =>
          builder.buildPrompt(
            MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
            baseParams,
            'A cinematic product reveal',
          ),
        'first_frame_image',
      );
    });

    it('rejects an empty first-frame image with a named 4xx validation error', () => {
      expectRequiredFieldValidation(
        () =>
          builder.buildPrompt(
            MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
            { ...baseParams, references: ['   '] },
            'A cinematic product reveal',
          ),
        'first_frame_image',
      );
    });

    it('rejects a non-URI first-frame image with a named 4xx validation error', () => {
      expectRequiredFieldValidation(
        () =>
          builder.buildPrompt(
            MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
            { ...baseParams, references: ['local-frame.jpg'] },
            'A cinematic product reveal',
          ),
        'first_frame_image',
      );
    });
  });

  describe('buildPrompt - MiniMax H3', () => {
    const baseParams: PromptBuilderParams = {
      height: 1080,
      modelCategory: ModelCategory.VIDEO,
      prompt: 'test',
      width: 1920,
    };

    it('should build the provider default 2K text-to-video input', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_MINIMAX_H3,
        baseParams,
        'A cinematic product reveal',
      );

      expect(result).toEqual({
        duration: 5,
        prompt: 'A cinematic product reveal',
        ratio: '16:9',
        reference_audio_urls: [],
        reference_image_urls: [],
        reference_video_urls: [],
        resolution: '2K',
      });
    });

    it('should map first/end frames and bounded multimodal references', () => {
      const references = Array.from(
        { length: 12 },
        (_, index) => `reference-${index + 1}.jpg`,
      );
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_MINIMAX_H3,
        {
          ...baseParams,
          audioUrl: 'reference.mp3',
          duration: 30,
          endFrame: 'last-frame.jpg',
          references,
          resolution: '768p',
          video: 'reference.mp4',
        },
        'Animate the product consistently',
      );

      expect(result).toEqual({
        duration: 15,
        first_frame_image: references[0],
        last_frame_image: 'last-frame.jpg',
        prompt: 'Animate the product consistently',
        ratio: 'adaptive',
        reference_audio_urls: ['reference.mp3'],
        reference_image_urls: references.slice(1, 10),
        reference_video_urls: ['reference.mp4'],
        resolution: '768P',
      });
    });
  });

  describe('buildPrompt - Sora 2', () => {
    const baseParams: PromptBuilderParams = {
      modelCategory: ModelCategory.VIDEO,
      prompt: 'A sunset over the ocean',
    };

    it('should build Sora 2 prompt', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_OPENAI_SORA_2,
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
        MODEL_KEYS.REPLICATE_OPENAI_SORA_2,
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
        MODEL_KEYS.REPLICATE_OPENAI_SORA_2_PRO,
        baseParams,
        'test',
      );

      expect(result).toHaveProperty('resolution', 'standard');
    });

    it('should accept "high" resolution', () => {
      const params = { ...baseParams, resolution: 'high' };
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_OPENAI_SORA_2_PRO,
        params,
        'test',
      );

      expect(result).toHaveProperty('resolution', 'high');
    });

    it('should fallback invalid resolution to standard', () => {
      const params = { ...baseParams, resolution: 'ultra' };
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_OPENAI_SORA_2_PRO,
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
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_2,
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
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_2,
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
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
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
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
        params,
        'test',
      );

      expect(result).toHaveProperty('generate_audio', false);
    });

    it('should include negative prompt from blacklist', () => {
      const params = { ...baseParams, blacklist: ['nsfw', 'violence'] };
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
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
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
        baseParams,
        'test',
      );

      expect(result).toHaveProperty('resolution', '1080p');
    });

    it('should default resolution to 720p in development', () => {
      const devBuilder = new ReplicateVideoBuilder(createConfigService(true));
      const result = devBuilder.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
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
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
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
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
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
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
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
          MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
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
        MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
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
          MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
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
        MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
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
        MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
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
          MODEL_KEYS.REPLICATE_KWAIVGI_KLING_AVATAR_V2,
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
          MODEL_KEYS.REPLICATE_KWAIVGI_KLING_AVATAR_V2,
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
        MODEL_KEYS.REPLICATE_KWAIVGI_KLING_AVATAR_V2,
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
        MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
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
        MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
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
        MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
        params,
        'test',
      );

      expect(result).toHaveProperty('duration', 15);
    });
  });

  describe('buildPrompt - remaining Kling variants', () => {
    const baseParams: PromptBuilderParams = {
      height: 1080,
      modelCategory: ModelCategory.VIDEO,
      prompt: 'test',
      width: 1920,
    };

    it('preserves Kling master defaults and optional inputs', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1_MASTER,
        {
          ...baseParams,
          blacklist: ['blur'],
          duration: 10,
          references: ['start.jpg'],
        },
        'A tracking shot',
      );

      expect(result).toMatchObject({
        aspect_ratio: '16:9',
        duration: 10,
        negative_prompt: 'blur',
        prompt: 'A tracking shot',
        start_image: 'start.jpg',
      });
    });

    it('preserves Kling V1.6 end-frame and reference-image mapping', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V1_6_PRO,
        {
          ...baseParams,
          endFrame: 'end.jpg',
          references: ['start.jpg', 'ref-1.jpg', 'ref-2.jpg'],
        },
        'A slow orbit',
      );

      expect(result).toMatchObject({
        duration: 5,
        end_image: 'end.jpg',
        prompt: 'A slow orbit',
        reference_images: ['ref-1.jpg', 'ref-2.jpg'],
        start_image: 'start.jpg',
      });
    });

    it('preserves Kling V3 Omni reference and video limits', () => {
      const references = Array.from(
        { length: 8 },
        (_, index) => `ref-${index + 1}.jpg`,
      );
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO,
        {
          ...baseParams,
          blacklist: ['artifact'],
          duration: 30,
          endFrame: 'end.jpg',
          isAudioEnabled: false,
          references,
          video: 'reference.mp4',
        },
        'A cinematic reveal',
      );

      expect(result).toMatchObject({
        duration: 15,
        end_image: 'end.jpg',
        generate_audio: false,
        mode: 'pro',
        negative_prompt: 'artifact',
        prompt: 'A cinematic reveal',
        reference_images: references.slice(0, 7),
        reference_video: 'reference.mp4',
        video_reference_type: 'feature',
      });
      expect(result).not.toHaveProperty('start_image');
    });

    it('preserves Kling V2.6 duration fallback and seed', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_6,
        {
          ...baseParams,
          blacklist: ['noise'],
          duration: 7,
          isAudioEnabled: true,
          references: ['start.jpg'],
          seed: 42,
        },
        'A locked-off shot',
      );

      expect(result).toMatchObject({
        duration: 5,
        generate_audio: true,
        negative_prompt: 'noise',
        prompt: 'A locked-off shot',
        seed: 42,
        start_image: 'start.jpg',
      });
    });

    it('preserves Kling O1 duration and reference limits', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_KWAIVGI_KLING_O1,
        {
          ...baseParams,
          duration: 1,
          references: [
            'one.jpg',
            'two.jpg',
            'three.jpg',
            'four.jpg',
            'five.jpg',
          ],
          seed: 7,
        },
        'A product spin',
      );

      expect(result).toEqual({
        duration: 3,
        prompt: 'A product spin',
        reference_images: ['one.jpg', 'two.jpg', 'three.jpg', 'four.jpg'],
        seed: 7,
      });
    });
  });

  describe('buildPrompt - unsupported model', () => {
    it('should throw for unsupported model', () => {
      expect(() =>
        builder.buildPrompt(
          MODEL_KEYS.REPLICATE_META_MUSICGEN,
          { modelCategory: ModelCategory.VIDEO, prompt: '' },
          'test',
        ),
      ).toThrow('Unsupported video model');
    });
  });
});
