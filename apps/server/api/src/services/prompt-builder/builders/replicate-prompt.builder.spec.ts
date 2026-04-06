// Mock the helpers module
vi.mock('@genfeedai/helpers', async () => ({
  ...(await vi.importActual('@genfeedai/helpers')),
  calculateAspectRatio: vi.fn((width?: number, height?: number) => {
    if (!width || !height) {
      return null;
    }
    if (width > height) {
      return '16:9';
    }
    if (height > width) {
      return '9:16';
    }
    return '1:1';
  }),
  convertRatioToOrientation: vi.fn((ratio: string) => {
    if (ratio === '9:16') {
      return 'portrait';
    }
    return 'landscape';
  }),
  DurationUtil: {
    validateSoraDuration: vi.fn((duration?: number) => {
      if (!duration) {
        return 4;
      }
      if ([4, 8, 12].includes(duration)) {
        return duration;
      }
      return 4;
    }),
  },
  getDefaultAspectRatio: vi.fn(() => '16:9'),
  normalizeAspectRatioForModel: vi.fn(
    (_model: string, ratio: string) => ratio || '16:9',
  ),
}));

import { ConfigService } from '@api/config/config.service';
import { ReplicatePromptBuilder } from '@api/services/prompt-builder/builders/replicate-prompt.builder';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import { MODEL_KEYS } from '@genfeedai/constants';
import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import {
  calculateAspectRatio,
  convertRatioToOrientation,
  DurationUtil,
  getDefaultAspectRatio,
  normalizeAspectRatioForModel,
} from '@genfeedai/helpers';
import { Test, type TestingModule } from '@nestjs/testing';

/**
 * Helper to create PromptBuilderParams with required fields
 */
const createParams = (
  overrides: Partial<PromptBuilderParams> = {},
): PromptBuilderParams => ({
  modelCategory: overrides.modelCategory ?? ModelCategory.VIDEO,
  prompt: overrides.prompt ?? 'Test prompt',
  ...overrides,
});

describe('ReplicatePromptBuilder', () => {
  let builder: ReplicatePromptBuilder;

  const mockConfigService = {
    get: vi.fn((key: string) => {
      const config: Record<string, string> = {
        REPLICATE_OWNER: 'genfeedai',
      };
      return config[key] || '';
    }),
    isDevelopment: false,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockConfigService.get.mockImplementation((key: string) => {
      const config: Record<string, string> = {
        REPLICATE_OWNER: 'genfeedai',
      };
      return config[key] || '';
    });

    (calculateAspectRatio as vi.Mock).mockImplementation(
      (width?: number, height?: number) => {
        if (!width || !height) {
          return null;
        }
        if (width > height) {
          return '16:9';
        }
        if (height > width) {
          return '9:16';
        }
        return '1:1';
      },
    );
    (convertRatioToOrientation as vi.Mock).mockImplementation(
      (ratio: string) => {
        if (ratio === '9:16') {
          return 'portrait';
        }
        return 'landscape';
      },
    );
    (DurationUtil.validateSoraDuration as vi.Mock).mockImplementation(
      (duration?: number) => {
        if (!duration) {
          return 4;
        }
        if ([4, 8, 12].includes(duration)) {
          return duration;
        }
        return 4;
      },
    );
    (getDefaultAspectRatio as vi.Mock).mockReturnValue('16:9');
    (normalizeAspectRatioForModel as vi.Mock).mockImplementation(
      (_model: string, ratio: string) => ratio || '16:9',
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplicatePromptBuilder,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    builder = module.get<ReplicatePromptBuilder>(ReplicatePromptBuilder);
  });

  describe('getProvider', () => {
    it('should return REPLICATE provider', () => {
      const result = builder.getProvider();
      expect(result).toBe(ModelProvider.REPLICATE);
    });
  });

  describe('supportsModel', () => {
    it('should return true for known Replicate models', () => {
      expect(builder.supportsModel(MODEL_KEYS.REPLICATE_GOOGLE_VEO_2)).toBe(
        true,
      );
      expect(builder.supportsModel(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3)).toBe(
        true,
      );
      expect(builder.supportsModel(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4)).toBe(
        true,
      );
      expect(builder.supportsModel(MODEL_KEYS.REPLICATE_OPENAI_SORA_2)).toBe(
        true,
      );
    });

    it('should return true for models containing REPLICATE_OWNER', () => {
      const customModel = 'genfeedai/custom-model:v1' as string;
      expect(builder.supportsModel(customModel)).toBe(true);
    });

    it('should return false for non-Replicate models', () => {
      // Use a non-replicate model key
      expect(builder.supportsModel(MODEL_KEYS.HEYGEN_AVATAR)).toBe(false);
    });
  });

  // ==========================================================================
  // OpenAI Sora Models
  // ==========================================================================
  describe('buildPrompt - OpenAI Sora 2', () => {
    it('should build prompt for Sora 2', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_OPENAI_SORA_2,
        createParams({
          duration: 8,
          height: 1920,
          modelCategory: ModelCategory.VIDEO,
          width: 1080,
        }),
        'A beautiful sunset',
      );

      expect(result).toEqual({
        aspect_ratio: 'portrait',
        prompt: 'A beautiful sunset',
        seconds: 8,
      });
    });

    it('should add reference image if provided', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_OPENAI_SORA_2,
        createParams({
          duration: 4,
          height: 1080,
          references: ['https://example.com/image.jpg'],
          width: 1920,
        }),
        'A beautiful sunset',
      );

      expect(result.input_reference).toBe('https://example.com/image.jpg');
    });
  });

  describe('buildPrompt - OpenAI Sora 2 Pro', () => {
    it('should build prompt for Sora 2 Pro with resolution', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_OPENAI_SORA_2_PRO,
        createParams({
          duration: 8,
          height: 1080,
          resolution: 'high',
          width: 1920,
        }),
        'A cityscape',
      );

      expect(result).toEqual({
        aspect_ratio: 'landscape',
        prompt: 'A cityscape',
        resolution: 'high',
        seconds: 8,
      });
    });

    it('should default to standard resolution if invalid', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_OPENAI_SORA_2_PRO,
        createParams({
          height: 1080,
          resolution: 'invalid',
          width: 1920,
        }),
        'A cityscape',
      );

      expect(result.resolution).toBe('standard');
    });
  });

  // ==========================================================================
  // Google Veo Models
  // ==========================================================================
  describe('buildPrompt - Google Veo 2', () => {
    it('should build prompt for Veo 2', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_2,
        createParams({
          duration: 5,
          height: 1080,
          seed: 12345,
          width: 1920,
        }),
        'A forest scene',
      );

      expect(result).toEqual({
        aspect_ratio: '16:9',
        duration: 5,
        prompt: 'A forest scene',
        seed: 12345,
      });
    });

    it('should add reference image if provided', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_2,
        createParams({
          height: 1080,
          references: ['https://example.com/image.jpg'],
          width: 1920,
        }),
        'A forest scene',
      );

      expect(result.image).toBe('https://example.com/image.jpg');
    });
  });

  describe('buildPrompt - Google Veo 3', () => {
    it('should build prompt for Veo 3 with audio', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
        createParams({
          blacklist: ['violence', 'nsfw'],
          duration: 8,
          height: 1080,
          isAudioEnabled: true,
          resolution: '1080p',
          width: 1920,
        }),
        'A nature documentary',
      );

      expect(result.prompt).toBe('A nature documentary');
      expect(result.negative_prompt).toBeDefined();
      expect(result.duration).toBe(8);
      expect(result.resolution).toBe('1080p');
      expect(result.generate_audio).toBe(true);
    });

    it('should normalize Sora-style resolution to Veo format', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
        createParams({
          height: 1080,
          resolution: 'high',
          width: 1920,
        }),
        'A nature documentary',
      );

      expect(result.resolution).toBe('1080p');
    });
  });

  describe('buildPrompt - Google Veo 3.1', () => {
    it('should build prompt for Veo 3.1 with R2V mode', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
        createParams({
          height: 1080,
          references: [
            'https://example.com/1.jpg',
            'https://example.com/2.jpg',
          ],
          width: 1920,
        }),
        'A cinematic scene',
      );

      expect(result.reference_images).toHaveLength(2);
    });

    it('should build prompt for Veo 3.1 with I2V mode', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
        createParams({
          endFrame: 'https://example.com/end.jpg',
          height: 1080,
          references: ['https://example.com/start.jpg'],
          width: 1920,
        }),
        'A cinematic scene',
      );

      expect(result.image).toBe('https://example.com/start.jpg');
      expect(result.last_frame).toBe('https://example.com/end.jpg');
    });

    it('should add seed if provided', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
        createParams({
          height: 1080,
          seed: 42,
          width: 1920,
        }),
        'A cinematic scene',
      );

      expect(result.seed).toBe(42);
    });
  });

  describe('buildPrompt - Google Veo 3.1 Fast', () => {
    it('should build prompt for Veo 3.1 Fast (no R2V support)', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
        createParams({
          height: 1920,
          references: [
            'https://example.com/1.jpg',
            'https://example.com/2.jpg',
          ],
          width: 1080,
        }),
        'A quick video',
      );

      // Should only use first image (I2V), not reference_images (R2V)
      expect(result.image).toBe('https://example.com/1.jpg');
      expect(result.reference_images).toBeUndefined();
    });
  });

  // ==========================================================================
  // Google Imagen Models
  // ==========================================================================
  describe('buildPrompt - Google Imagen', () => {
    it('should build prompt for Imagen 4', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
        createParams({
          height: 1024,
          modelCategory: ModelCategory.IMAGE,
          width: 1024,
        }),
        'A photorealistic portrait',
      );

      expect(result).toEqual({
        aspect_ratio: '1:1',
        output_format: 'jpg',
        prompt: 'A photorealistic portrait',
        safety_filter_level: 'block_only_high',
      });
    });

    it('should build prompt for Imagen 4 Ultra', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_ULTRA,
        createParams({
          height: 1080,
          modelCategory: ModelCategory.IMAGE,
          width: 1920,
        }),
        'An ultra-detailed landscape',
      );

      expect(result.prompt).toBe('An ultra-detailed landscape');
      expect(result.output_format).toBe('jpg');
    });
  });

  // ==========================================================================
  // Google Nano Banana Models
  // ==========================================================================
  describe('buildPrompt - Google Nano Banana', () => {
    it('should build prompt for Nano Banana with image input', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
        createParams({
          modelCategory: ModelCategory.IMAGE,
          references: ['https://example.com/image.jpg'],
        }),
        'Transform this image',
      );

      expect(result.image_input).toEqual(['https://example.com/image.jpg']);
      expect(result.aspect_ratio).toBe('match_input_image');
    });

    it('should build prompt for Nano Banana Pro with resolution', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_PRO,
        createParams({
          height: 1024,
          modelCategory: ModelCategory.IMAGE,
          references: [
            'https://example.com/1.jpg',
            'https://example.com/2.jpg',
          ],
          resolution: '2K',
          width: 1024,
        }),
        'Transform these images',
      );

      expect(result.resolution).toBe('2K');
      expect(result.image_input).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Ideogram Models
  // ==========================================================================
  describe('buildPrompt - Ideogram Character', () => {
    it('should build prompt for Ideogram Character with required reference', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_CHARACTER,
        createParams({
          height: 1024,
          modelCategory: ModelCategory.IMAGE,
          references: ['https://example.com/character.jpg'],
          width: 1024,
        }),
        'A character in a new pose',
      );

      expect(result.character_reference_image).toBe(
        'https://example.com/character.jpg',
      );
      expect(result.magic_prompt_option).toBe('Auto');
    });

    it('should throw error if no character reference provided', () => {
      expect(() =>
        builder.buildPrompt(
          MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_CHARACTER,
          createParams({
            height: 1024,
            modelCategory: ModelCategory.IMAGE,
            width: 1024,
          }),
          'A character',
        ),
      ).toThrow('character_reference_image is required');
    });
  });

  describe('buildPrompt - Ideogram V3 Balanced', () => {
    it('should build prompt for Ideogram V3 Balanced', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_BALANCED,
        createParams({
          height: 1024,
          modelCategory: ModelCategory.IMAGE,
          seed: 42,
          width: 1024,
        }),
        'A balanced composition',
      );

      expect(result.seed).toBe(42);
      expect(result.magic_prompt_option).toBe('Auto');
    });
  });

  // ==========================================================================
  // ByteDance SeeDream Models
  // ==========================================================================
  describe('buildPrompt - ByteDance SeeDream', () => {
    it('should build prompt for SeeDream 4', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4,
        createParams({
          height: 1024,
          modelCategory: ModelCategory.IMAGE,
          references: ['https://example.com/1.jpg'],
          width: 1024,
        }),
        'A dreamy scene',
      );

      expect(result.enhance_prompt).toBe(true);
      expect(result.image_input).toHaveLength(1);
    });

    it('should build prompt for SeeDream 4.5', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5,
        createParams({
          height: 2048,
          modelCategory: ModelCategory.IMAGE,
          width: 2048,
        }),
        'A high-res dreamy scene',
      );

      expect(result.size).toBe('2K');
    });
  });

  // ==========================================================================
  // FLUX Models
  // ==========================================================================
  describe('buildPrompt - FLUX 1.1 Pro', () => {
    it('should build prompt for FLUX 1.1 Pro', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_1_1_PRO,
        createParams({
          height: 1024,
          modelCategory: ModelCategory.IMAGE,
          seed: 42,
          width: 1024,
        }),
        'A FLUX-generated image',
      );

      expect(result.seed).toBe(42);
      expect(result.prompt_upsampling).toBe(false);
      expect(result.safety_tolerance).toBe(2);
    });

    it('should add image_prompt for FLUX Redux', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_1_1_PRO,
        createParams({
          modelCategory: ModelCategory.IMAGE,
          references: ['https://example.com/ref.jpg'],
        }),
        'Transform this',
      );

      expect(result.image_prompt).toBe('https://example.com/ref.jpg');
    });
  });

  describe('buildPrompt - FLUX 2 Pro', () => {
    it('should build prompt for FLUX 2 Pro with multiple input images', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_PRO,
        createParams({
          modelCategory: ModelCategory.IMAGE,
          references: [
            'https://example.com/1.jpg',
            'https://example.com/2.jpg',
            'https://example.com/3.jpg',
          ],
        }),
        'Combine these images',
      );

      expect(result.input_images).toHaveLength(3);
    });

    it('should limit input images to 8', () => {
      const references = Array.from(
        { length: 10 },
        (_, i) => `https://example.com/${i}.jpg`,
      );

      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_PRO,
        createParams({ modelCategory: ModelCategory.IMAGE, references }),
        'Many images',
      );

      expect(result.input_images).toHaveLength(8);
    });
  });

  describe('buildPrompt - FLUX Schnell', () => {
    it('should build prompt for FLUX Schnell (fast mode)', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
        createParams({
          height: 1024,
          modelCategory: ModelCategory.IMAGE,
          outputs: 4,
          width: 1024,
        }),
        'A quick image',
      );

      expect(result.num_outputs).toBe(4);
      expect(result.go_fast).toBe(true);
      expect(result.num_inference_steps).toBe(4);
    });
  });

  // ==========================================================================
  // Qwen Models
  // ==========================================================================
  describe('buildPrompt - Qwen Image', () => {
    it('should build prompt for Qwen Image', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_QWEN_QWEN_IMAGE,
        createParams({
          blacklist: ['nsfw'],
          height: 1024,
          modelCategory: ModelCategory.IMAGE,
          width: 1024,
        }),
        'A Qwen-generated image',
      );

      expect(result.guidance).toBe(3);
      expect(result.negative_prompt).toBeDefined();
    });

    it('should add image for img2img', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_QWEN_QWEN_IMAGE,
        createParams({
          modelCategory: ModelCategory.IMAGE,
          references: ['https://example.com/input.jpg'],
        }),
        'Transform this',
      );

      expect(result.image).toBe('https://example.com/input.jpg');
      expect(result.strength).toBe(0.9);
    });
  });

  // ==========================================================================
  // RunwayML Models
  // ==========================================================================
  describe('buildPrompt - RunwayML Gen4 Image Turbo', () => {
    it('should build prompt for Gen4 Image Turbo', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_RUNWAYML_GEN4_IMAGE_TURBO,
        createParams({
          height: 1080,
          modelCategory: ModelCategory.IMAGE,
          seed: 42,
          width: 1920,
        }),
        'A generated image',
      );

      expect(result.resolution).toBe('1080p');
      expect(result.seed).toBe(42);
    });

    it('should limit reference images to 3', () => {
      const references = Array.from(
        { length: 5 },
        (_, i) => `https://example.com/${i}.jpg`,
      );

      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_RUNWAYML_GEN4_IMAGE_TURBO,
        createParams({ modelCategory: ModelCategory.IMAGE, references }),
        'With references',
      );

      expect(result.reference_images).toHaveLength(3);
    });
  });

  // ==========================================================================
  // Meta MusicGen
  // ==========================================================================
  describe('buildPrompt - Meta MusicGen', () => {
    it('should build prompt for MusicGen', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_META_MUSICGEN,
        createParams({
          duration: 15,
          modelCategory: ModelCategory.MUSIC,
          seed: 42,
        }),
        'An upbeat electronic track',
      );

      expect(result).toEqual({
        classifier_free_guidance: 3,
        continuation: false,
        continuation_start: 0,
        duration: 15,
        model_version: 'stereo-large',
        normalization_strategy: 'loudness',
        output_format: 'mp3',
        prompt: 'An upbeat electronic track',
        seed: 42,
        temperature: 1,
        top_k: 250,
        top_p: 0,
      });
    });
  });

  // ==========================================================================
  // Topaz Models
  // ==========================================================================
  describe('buildPrompt - Topaz Image Upscale', () => {
    it('should build prompt for image upscaling', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
        createParams({
          faceEnhancement: true,
          modelCategory: ModelCategory.IMAGE,
          references: ['https://example.com/low-res.jpg'],
          upscaleFactor: '4x',
        }),
        '', // prompt not used for this model
      );

      expect(result.image).toBe('https://example.com/low-res.jpg');
      expect(result.upscale_factor).toBe('4x');
      expect(result.face_enhancement).toBe(true);
    });
  });

  describe('buildPrompt - Topaz Video Upscale', () => {
    it('should build prompt for video upscaling', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
        createParams({
          modelCategory: ModelCategory.VIDEO,
          target_fps: 60,
          target_resolution: '4K',
          video: 'https://example.com/video.mp4',
        }),
        '',
      );

      expect(result.video).toBe('https://example.com/video.mp4');
      expect(result.target_fps).toBe(60);
      expect(result.target_resolution).toBe('4K');
    });
  });

  // ==========================================================================
  // Luma Models
  // ==========================================================================
  describe('buildPrompt - Luma Reframe Image', () => {
    it('should build prompt for Luma Reframe Image', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
        createParams({
          height: 1920,
          modelCategory: ModelCategory.IMAGE,
          references: ['https://example.com/image.jpg'],
          width: 1080,
        }),
        'Reframe to portrait',
      );

      expect(result.model).toBe('photon-flash-1');
      expect(result.image).toBe('https://example.com/image.jpg');
    });
  });

  describe('buildPrompt - Luma Reframe Video', () => {
    it('should build prompt for Luma Reframe Video', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO,
        createParams({
          height: 1920,
          modelCategory: ModelCategory.VIDEO,
          video: 'https://example.com/video.mp4',
          width: 1080,
        }),
        'Reframe to portrait',
      );

      expect(result.video).toBe('https://example.com/video.mp4');
    });
  });

  // ==========================================================================
  // WAN Video Models
  // ==========================================================================
  describe('buildPrompt - WAN Video 2.2 I2V Fast', () => {
    it('should build prompt for WAN Video with image', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
        createParams({
          height: 1080,
          modelCategory: ModelCategory.VIDEO,
          references: ['https://example.com/start.jpg'],
          seed: 42,
          width: 1920,
        }),
        'Animate this image',
      );

      expect(result.image).toBe('https://example.com/start.jpg');
      expect(result.num_frames).toBe(81);
      expect(result.seed).toBe(42);
    });

    it('should throw error if no image provided', () => {
      expect(() =>
        builder.buildPrompt(
          MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
          createParams({
            height: 1080,
            modelCategory: ModelCategory.VIDEO,
            width: 1920,
          }),
          'Animate',
        ),
      ).toThrow('image is required');
    });

    it('should add last_image for interpolation', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
        createParams({
          endFrame: 'https://example.com/end.jpg',
          height: 1080,
          modelCategory: ModelCategory.VIDEO,
          references: ['https://example.com/start.jpg'],
          width: 1920,
        }),
        'Animate between frames',
      );

      expect(result.last_image).toBe('https://example.com/end.jpg');
    });

    it('should normalize resolution to WAN-supported values', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
        createParams({
          height: 1080,
          modelCategory: ModelCategory.VIDEO,
          references: ['https://example.com/image.jpg'],
          resolution: '1080p',
          width: 1920,
        }),
        'Animate',
      );

      expect(result.resolution).toBe('720p'); // WAN max is 720p
    });
  });

  // ==========================================================================
  // Kling Models
  // ==========================================================================
  describe('buildPrompt - Kling V2.1', () => {
    it('should build prompt for Kling V2.1', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
        createParams({
          blacklist: ['violence'],
          duration: 5,
          modelCategory: ModelCategory.VIDEO,
          references: ['https://example.com/start.jpg'],
        }),
        'A cinematic scene',
      );

      expect(result.start_image).toBe('https://example.com/start.jpg');
      expect(result.duration).toBe(5);
      expect(result.mode).toBe('standard');
    });

    it('should throw error if no start_image provided', () => {
      expect(() =>
        builder.buildPrompt(
          MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
          createParams({ modelCategory: ModelCategory.VIDEO }),
          'A scene',
        ),
      ).toThrow('start_image is required');
    });

    it('should use pro mode when end_image provided', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
        createParams({
          endFrame: 'https://example.com/end.jpg',
          modelCategory: ModelCategory.VIDEO,
          references: ['https://example.com/start.jpg'],
        }),
        'Interpolate',
      );

      expect(result.mode).toBe('pro');
      expect(result.end_image).toBe('https://example.com/end.jpg');
    });
  });

  describe('buildPrompt - Kling V2.1 Master', () => {
    it('should build prompt for Kling V2.1 Master', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1_MASTER,
        createParams({
          duration: 10,
          height: 1080,
          modelCategory: ModelCategory.VIDEO,
          width: 1920,
        }),
        'A masterful scene',
      );

      expect(result.duration).toBe(10);
      expect(result.aspect_ratio).toBe('16:9');
    });

    it('should validate duration to 5 or 10', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1_MASTER,
        createParams({
          duration: 7,
          height: 1080,
          modelCategory: ModelCategory.VIDEO,
          width: 1920,
        }),
        'A scene',
      );

      expect(result.duration).toBe(5); // Invalid, defaults to 5
    });
  });

  // ==========================================================================
  // LLM Models
  // ==========================================================================
  describe('buildPrompt - DeepSeek R1', () => {
    it('should build prompt for DeepSeek R1', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_DEEPSEEK_AI_DEEPSEEK_R1,
        createParams({
          maxTokens: 4096,
          modelCategory: ModelCategory.TEXT,
          temperature: 0.5,
        }),
        'Solve this math problem',
      );

      expect(result).toEqual({
        frequency_penalty: 0,
        max_tokens: 4096,
        presence_penalty: 0,
        prompt: 'Solve this math problem',
        temperature: 0.5,
        top_p: 1,
      });
    });
  });

  describe('buildPrompt - GPT 5.2', () => {
    it('should build prompt for GPT 5.2 with images', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_OPENAI_GPT_5_2,
        createParams({
          maxTokens: 8192,
          modelCategory: ModelCategory.TEXT,
          references: ['https://example.com/image.jpg'],
          systemPrompt: 'You are a helpful assistant',
        }),
        'Describe this image',
      );

      expect(result.system_prompt).toBe('You are a helpful assistant');
      expect(result.image_input).toHaveLength(1);
    });
  });

  describe('buildPrompt - GPT Image 1.5', () => {
    it('should build prompt for GPT Image 1.5', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_1_5,
        createParams({
          height: 1024,
          modelCategory: ModelCategory.IMAGE,
          outputFormat: 'png',
          outputs: 4,
          width: 1024,
        }),
        'Generate an image',
      );

      expect(result.output_format).toBe('png');
      expect(result.number_of_images).toBe(4);
    });
  });

  describe('buildPrompt - Gemini 2.5 Flash', () => {
    it('should build prompt for Gemini 2.5 Flash', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_2_5_FLASH,
        createParams({
          maxTokens: 4096,
          modelCategory: ModelCategory.TEXT,
          references: ['https://example.com/doc.jpg'],
          systemPrompt: 'Be concise',
          temperature: 0.7,
        }),
        'Summarize this document',
      );

      expect(result.system_instruction).toBe('Be concise');
      expect(result.images).toHaveLength(1);
    });
  });

  describe('buildPrompt - Meta Llama 3.1 405B', () => {
    it('should build prompt for Llama 3.1 405B', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_META_LLAMA_3_1_405B_INSTRUCT,
        createParams({
          maxTokens: 1024,
          modelCategory: ModelCategory.TEXT,
          systemPrompt: 'You are an expert coder',
          temperature: 0.8,
          topK: 40,
          topP: 0.95,
        }),
        'Write a Python function',
      );

      expect(result.system_prompt).toBe('You are an expert coder');
      expect(result.top_k).toBe(40);
    });
  });

  // ==========================================================================
  // Custom/Trained Models
  // ==========================================================================
  describe('buildPrompt - Custom Models', () => {
    it('should handle custom trained models via generic image builder', () => {
      const customModel = 'genfeedai/custom-flux:v1' as string;
      (mockConfigService.get as vi.Mock).mockReturnValue('genfeedai');

      const result = builder.buildPrompt(
        customModel,
        createParams({
          height: 1024,
          modelCategory: ModelCategory.IMAGE,
          outputs: 2,
          references: ['https://example.com/ref.jpg'],
          seed: 42,
          width: 1024,
        }),
        'A custom generation',
      );

      // Routed through generic image builder (catch-all)
      expect(result.prompt).toBe('A custom generation');
      expect(result.seed).toBe(42);
      expect(result.aspect_ratio).toBeDefined();
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================
  describe('Edge Cases', () => {
    it('should handle empty params', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
        createParams({ modelCategory: ModelCategory.IMAGE }),
        'A simple prompt',
      );

      expect(result.prompt).toBe('A simple prompt');
    });

    it('should handle undefined optional params', () => {
      const result = builder.buildPrompt(
        MODEL_KEYS.REPLICATE_GOOGLE_VEO_2,
        createParams({
          duration: undefined,
          height: undefined,
          modelCategory: ModelCategory.VIDEO,
          seed: undefined,
          width: undefined,
        }),
        'Test',
      );

      expect(result.duration).toBe(5);
      expect(result.seed).toBe(-1);
    });

    it('should use generic image builder for unknown models', () => {
      const unknownModel = 'unknown/model:v1' as string;
      const params = createParams({
        height: 512,
        modelCategory: ModelCategory.IMAGE,
        width: 512,
      });

      const result = builder.buildPrompt(unknownModel, params, 'Test');

      // Unknown models go through generic image builder (catch-all)
      expect(result.prompt).toBe('Test');
      expect(result.aspect_ratio).toBeDefined();
      expect(result.output_format).toBe('jpg');
    });
  });
});
