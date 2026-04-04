import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import type { ModelSelectionOptions } from '@api/services/router/interfaces/router.interfaces';
import { RouterService } from '@api/services/router/router.service';
import { ModelCategory, ModelKey } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('RouterService', () => {
  let service: RouterService;
  let modelsService: vi.Mocked<ModelsService>;
  let loggerService: vi.Mocked<LoggerService>;

  const createMockModel = (overrides: Record<string, unknown> = {}) =>
    ({
      _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
      capabilities: [],
      category: ModelCategory.IMAGE,
      cost: 50,
      costTier: 'medium' as const,
      isDefault: false,
      isDeleted: false,
      isHighlighted: false,
      key: 'test-model',
      label: 'Test Model',
      maxDimensions: { height: 2048, width: 2048 },
      provider: 'test-provider',
      qualityTier: 'standard' as const,
      recommendedFor: [],
      speedTier: 'medium' as const,
      supportsFeatures: [],
      ...overrides,
    }) as unknown as ModelDocument;

  beforeEach(async () => {
    const mockModelsService = {
      findAllActive: vi.fn(),
      findOne: vi.fn(),
    };

    const mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RouterService,
        {
          provide: ModelsService,
          useValue: mockModelsService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<RouterService>(RouterService);
    modelsService = module.get(ModelsService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('service definition', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('selectModel', () => {
    describe('Image Generation', () => {
      it('should select fast model for speed-prioritized requests', async () => {
        const fastModel = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'google/imagen-4-fast',
          speedTier: 'fast',
        });

        const slowModel = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'google/imagen-4-slow',
          qualityTier: 'ultra',
          speedTier: 'slow',
        });

        modelsService.findAllActive.mockResolvedValue([fastModel, slowModel]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prioritize: 'speed',
          prompt: 'A simple landscape',
        };

        const result = await service.selectModel(options);

        expect(result.selectedModel).toBe('google/imagen-4-fast');
        expect(result.reason).toContain('speed');
      });

      it('should select ultra quality model for quality-prioritized requests', async () => {
        const ultraModel = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'google/imagen-4-ultra',
          qualityTier: 'ultra',
        });

        const standardModel = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'google/imagen-4-standard',
          qualityTier: 'standard',
        });

        modelsService.findAllActive.mockResolvedValue([
          standardModel,
          ultraModel,
        ]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prioritize: 'quality',
          prompt: 'A highly detailed professional portrait',
        };

        const result = await service.selectModel(options);

        expect(result.selectedModel).toBe('google/imagen-4-ultra');
        expect(result.reason).toContain('quality');
      });

      it('should select high quality model when ultra is not available', async () => {
        const highModel = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'google/imagen-4-high',
          qualityTier: 'high',
        });

        const standardModel = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'google/imagen-4-standard',
          qualityTier: 'standard',
        });

        modelsService.findAllActive.mockResolvedValue([
          standardModel,
          highModel,
        ]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prioritize: 'quality',
          prompt: 'A detailed portrait',
        };

        const result = await service.selectModel(options);

        expect(result.selectedModel).toBe('google/imagen-4-high');
      });

      it('should select stylized model for anime/cartoon prompts', async () => {
        const stylizedModel = createMockModel({
          capabilities: ['stylized', 'creative'],
          category: ModelCategory.IMAGE,
          key: 'gpt-image-1',
        });

        const standardModel = createMockModel({
          capabilities: ['photorealistic'],
          category: ModelCategory.IMAGE,
          key: 'google/imagen-4',
        });

        modelsService.findAllActive.mockResolvedValue([
          standardModel,
          stylizedModel,
        ]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt: 'An anime style character with blue hair',
        };

        const result = await service.selectModel(options);

        expect(result.selectedModel).toBe('gpt-image-1');
        expect(result.alternatives).toBeDefined();
      });

      it('should select model matching photorealistic detected features', async () => {
        const photoModel = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'google/imagen-4',
          recommendedFor: ['photorealistic', 'portrait'],
        });

        const otherModel = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'other-model',
          recommendedFor: ['cartoon'],
        });

        modelsService.findAllActive.mockResolvedValue([otherModel, photoModel]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt: 'A photorealistic portrait of a person in natural lighting',
        };

        const result = await service.selectModel(options);

        expect(result.selectedModel).toBe('google/imagen-4');
        expect(result.analysis.detectedFeatures).toContain('photorealistic');
      });

      it('should select model supporting large dimensions for large images', async () => {
        const largeModel = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'large-dimension-model',
          maxDimensions: { height: 4096, width: 4096 },
        });

        const smallModel = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'small-dimension-model',
          maxDimensions: { height: 1024, width: 1024 },
        });

        modelsService.findAllActive.mockResolvedValue([smallModel, largeModel]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          dimensions: { height: 2500, width: 2500 },
          prompt: 'A beautiful landscape',
        };

        const result = await service.selectModel(options);

        expect(result.selectedModel).toBe('large-dimension-model');
      });

      it('should penalize models that cannot handle requested dimensions', async () => {
        const largeModel = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'large-dimension-model',
          maxDimensions: { height: 4096, width: 4096 },
        });

        const smallModel = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'small-dimension-model',
          maxDimensions: { height: 512, width: 512 },
          qualityTier: 'ultra',
        });

        modelsService.findAllActive.mockResolvedValue([smallModel, largeModel]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          dimensions: { height: 2048, width: 2048 },
          prompt: 'A beautiful landscape',
        };

        const result = await service.selectModel(options);

        expect(result.selectedModel).toBe('large-dimension-model');
      });

      it('should handle cost-prioritized requests', async () => {
        const cheapModel = createMockModel({
          category: ModelCategory.IMAGE,
          costTier: 'low',
          key: 'cheap-model',
        });

        const expensiveModel = createMockModel({
          category: ModelCategory.IMAGE,
          costTier: 'high',
          key: 'expensive-model',
          qualityTier: 'ultra',
        });

        modelsService.findAllActive.mockResolvedValue([
          expensiveModel,
          cheapModel,
        ]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prioritize: 'cost',
          prompt: 'A simple cartoon character',
        };

        const result = await service.selectModel(options);

        expect(result.selectedModel).toBe('cheap-model');
        expect(result.reason).toContain('cost');
      });

      it('should prefer default models slightly', async () => {
        const defaultModel = createMockModel({
          category: ModelCategory.IMAGE,
          isDefault: true,
          key: 'default-model',
        });

        const otherModel = createMockModel({
          category: ModelCategory.IMAGE,
          isDefault: false,
          key: 'other-model',
        });

        modelsService.findAllActive.mockResolvedValue([
          otherModel,
          defaultModel,
        ]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt: 'A test image',
        };

        const result = await service.selectModel(options);

        expect(result.selectedModel).toBe('default-model');
      });

      it('should prefer highlighted models slightly', async () => {
        const highlightedModel = createMockModel({
          category: ModelCategory.IMAGE,
          isHighlighted: true,
          key: 'highlighted-model',
        });

        const otherModel = createMockModel({
          category: ModelCategory.IMAGE,
          isHighlighted: false,
          key: 'other-model',
        });

        modelsService.findAllActive.mockResolvedValue([
          otherModel,
          highlightedModel,
        ]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt: 'A test image',
        };

        const result = await service.selectModel(options);

        expect(result.selectedModel).toBe('highlighted-model');
      });
    });

    describe('Video Generation', () => {
      it('should select fast model for speed-prioritized video requests', async () => {
        const fastModel = createMockModel({
          category: ModelCategory.VIDEO,
          key: 'google/veo-3-fast',
          speedTier: 'fast',
        });

        const slowModel = createMockModel({
          category: ModelCategory.VIDEO,
          key: 'google/veo-3',
          speedTier: 'slow',
        });

        modelsService.findAllActive.mockResolvedValue([slowModel, fastModel]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.VIDEO,
          prioritize: 'speed',
          prompt: 'A quick video clip',
        };

        const result = await service.selectModel(options);

        expect(result.selectedModel).toBe('google/veo-3-fast');
      });

      it('should select model with speech support when speech is required', async () => {
        const speechModel = createMockModel({
          category: ModelCategory.VIDEO,
          key: 'google/veo-3',
          supportsFeatures: ['speech'],
        });

        const noSpeechModel = createMockModel({
          category: ModelCategory.VIDEO,
          key: 'other-model',
          supportsFeatures: [],
        });

        modelsService.findAllActive.mockResolvedValue([
          noSpeechModel,
          speechModel,
        ]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.VIDEO,
          prompt: 'A video with narration',
          speech: 'Hello world',
        };

        const result = await service.selectModel(options);

        expect(result.selectedModel).toBe('google/veo-3');
        expect(result.reason).toContain('speech');
      });

      it('should disqualify models without required speech feature', async () => {
        const speechModel = createMockModel({
          category: ModelCategory.VIDEO,
          key: 'speech-model',
          supportsFeatures: ['speech'],
        });

        const noSpeechModel = createMockModel({
          category: ModelCategory.VIDEO,
          key: 'no-speech-model',
          qualityTier: 'ultra',
          supportsFeatures: [],
        });

        modelsService.findAllActive.mockResolvedValue([
          noSpeechModel,
          speechModel,
        ]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.VIDEO,
          prompt: 'A video with narration',
          speech: 'Hello world',
        };

        const result = await service.selectModel(options);

        expect(result.selectedModel).toBe('speech-model');
      });

      it('should select model with long-duration support for long videos', async () => {
        const longDurationModel = createMockModel({
          category: ModelCategory.VIDEO,
          key: 'google/veo-3',
          supportsFeatures: ['long-duration'],
        });

        const shortDurationModel = createMockModel({
          category: ModelCategory.VIDEO,
          key: 'short-model',
          supportsFeatures: ['short-duration'],
        });

        modelsService.findAllActive.mockResolvedValue([
          shortDurationModel,
          longDurationModel,
        ]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.VIDEO,
          duration: 45,
          prompt: 'A cinematic video',
        };

        const result = await service.selectModel(options);

        expect(result.selectedModel).toBe('google/veo-3');
      });

      it('should select model with short-duration support for short clips', async () => {
        const shortDurationModel = createMockModel({
          category: ModelCategory.VIDEO,
          key: 'short-model',
          supportsFeatures: ['short-duration'],
        });

        const longDurationModel = createMockModel({
          category: ModelCategory.VIDEO,
          key: 'long-model',
          supportsFeatures: ['long-duration'],
        });

        modelsService.findAllActive.mockResolvedValue([
          longDurationModel,
          shortDurationModel,
        ]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.VIDEO,
          duration: 8,
          prompt: 'A short video clip',
        };

        const result = await service.selectModel(options);

        expect(result.selectedModel).toBe('short-model');
      });
    });

    describe('Prompt Analysis', () => {
      it('should detect quality indicators in prompt', async () => {
        const model = createMockModel({ category: ModelCategory.IMAGE });
        modelsService.findAllActive.mockResolvedValue([model]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt:
            'A high quality professional photorealistic portrait with intricate details',
        };

        const result = await service.selectModel(options);

        expect(result.analysis.hasQualityIndicators).toBe(true);
        expect(result.analysis.complexity).toBe('complex');
      });

      it('should detect speed indicators in prompt', async () => {
        const model = createMockModel({ category: ModelCategory.IMAGE });
        modelsService.findAllActive.mockResolvedValue([model]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt: 'A quick simple sketch',
        };

        const result = await service.selectModel(options);

        expect(result.analysis.hasSpeedIndicators).toBe(true);
      });

      it('should detect specific art styles in prompt', async () => {
        const model = createMockModel({ category: ModelCategory.IMAGE });
        modelsService.findAllActive.mockResolvedValue([model]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt: 'An oil painting of a sunset',
        };

        const result = await service.selectModel(options);

        expect(result.analysis.hasSpecificStyle).toBe(true);
      });

      it('should categorize simple prompts as simple', async () => {
        const model = createMockModel({ category: ModelCategory.IMAGE });
        modelsService.findAllActive.mockResolvedValue([model]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt: 'A cat',
        };

        const result = await service.selectModel(options);

        expect(result.analysis.complexity).toBe('simple');
      });

      it('should categorize long complex prompts as complex', async () => {
        const model = createMockModel({ category: ModelCategory.IMAGE });
        modelsService.findAllActive.mockResolvedValue([model]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt:
            'A highly detailed cyberpunk cityscape at night with neon lights, flying cars, holographic advertisements, ' +
            'rain-soaked streets reflecting the vibrant colors, towering skyscrapers with futuristic architecture, ' +
            'and crowds of people with augmented reality devices',
        };

        const result = await service.selectModel(options);

        expect(result.analysis.complexity).toBe('complex');
      });

      it('should detect cinematic feature in prompt', async () => {
        const model = createMockModel({ category: ModelCategory.IMAGE });
        modelsService.findAllActive.mockResolvedValue([model]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt: 'A cinematic movie scene',
        };

        const result = await service.selectModel(options);

        expect(result.analysis.detectedFeatures).toContain('cinematic');
      });

      it('should detect landscape feature in prompt', async () => {
        const model = createMockModel({ category: ModelCategory.IMAGE });
        modelsService.findAllActive.mockResolvedValue([model]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt: 'A beautiful landscape with nature',
        };

        const result = await service.selectModel(options);

        expect(result.analysis.detectedFeatures).toContain('landscape');
      });

      it('should detect portrait feature in prompt', async () => {
        const model = createMockModel({ category: ModelCategory.IMAGE });
        modelsService.findAllActive.mockResolvedValue([model]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt: 'A portrait of a person face',
        };

        const result = await service.selectModel(options);

        expect(result.analysis.detectedFeatures).toContain('portrait');
      });

      it('should detect artistic feature in prompt', async () => {
        const model = createMockModel({ category: ModelCategory.IMAGE });
        modelsService.findAllActive.mockResolvedValue([model]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt: 'An artistic creative abstract composition',
        };

        const result = await service.selectModel(options);

        expect(result.analysis.detectedFeatures).toContain('artistic');
      });

      it('should prefer high quality model for complex prompts', async () => {
        const highQualityModel = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'high-quality',
          qualityTier: 'high',
        });

        const standardModel = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'standard',
          qualityTier: 'standard',
        });

        modelsService.findAllActive.mockResolvedValue([
          standardModel,
          highQualityModel,
        ]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt:
            'A very long and complex prompt that requires high quality output with many details and features',
        };

        const result = await service.selectModel(options);

        expect(result.analysis.complexity).toBe('complex');
      });

      it('should prefer fast model for simple prompts', async () => {
        const fastModel = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'fast-model',
          speedTier: 'fast',
        });

        const slowModel = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'slow-model',
          speedTier: 'slow',
        });

        modelsService.findAllActive.mockResolvedValue([slowModel, fastModel]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt: 'A cat',
        };

        const result = await service.selectModel(options);

        expect(result.analysis.complexity).toBe('simple');
        expect(result.selectedModel).toBe('fast-model');
      });
    });

    describe('Error Handling', () => {
      it('should use fallback when no models found for category', async () => {
        modelsService.findAllActive.mockResolvedValue([]);

        const defaultModel = createMockModel({
          category: ModelCategory.IMAGE,
          key: ModelKey.REPLICATE_GOOGLE_NANO_BANANA_PRO,
        });

        modelsService.findOne.mockResolvedValue(defaultModel);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt: 'A test image',
        };

        const result = await service.selectModel(options);

        expect(result.selectedModel).toBe(
          ModelKey.REPLICATE_GOOGLE_NANO_BANANA_PRO,
        );
        expect(result.reason).toContain('Default model');
        expect(loggerService.warn).toHaveBeenCalled();
      });

      it('should throw NotFoundException when no models found and no fallback available', async () => {
        modelsService.findAllActive.mockResolvedValue([]);
        modelsService.findOne.mockResolvedValue(null);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt: 'A test image',
        };

        await expect(service.selectModel(options)).rejects.toThrow(
          NotFoundException,
        );
      });

      it('should log errors appropriately', async () => {
        const error = new Error('Database error');
        modelsService.findAllActive.mockRejectedValue(error);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt: 'A test image',
        };

        await expect(service.selectModel(options)).rejects.toThrow(error);
        expect(loggerService.error).toHaveBeenCalled();
      });
    });

    describe('Alternatives', () => {
      it('should provide alternative model recommendations', async () => {
        const model1 = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'model-1',
          speedTier: 'fast',
        });

        const model2 = createMockModel({
          category: ModelCategory.IMAGE,
          costTier: 'low',
          key: 'model-2',
        });

        const model3 = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'model-3',
          qualityTier: 'high',
        });

        modelsService.findAllActive.mockResolvedValue([model1, model2, model3]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt: 'A landscape',
        };

        const result = await service.selectModel(options);

        expect(result.alternatives).toBeDefined();
        expect(result.alternatives.length).toBeLessThanOrEqual(2);
        result.alternatives.forEach((alt) => {
          expect(alt).toHaveProperty('model');
          expect(alt).toHaveProperty('reason');
          expect(alt).toHaveProperty('score');
        });
      });

      it('should generate alternative reasons based on model attributes', async () => {
        const selectedModel = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'selected-model',
          qualityTier: 'ultra',
        });

        const fastAlternative = createMockModel({
          category: ModelCategory.IMAGE,
          key: 'fast-alt',
          speedTier: 'fast',
        });

        const cheapAlternative = createMockModel({
          category: ModelCategory.IMAGE,
          costTier: 'low',
          key: 'cheap-alt',
        });

        const stylizedAlternative = createMockModel({
          capabilities: ['stylized'],
          category: ModelCategory.IMAGE,
          key: 'stylized-alt',
        });

        modelsService.findAllActive.mockResolvedValue([
          selectedModel,
          fastAlternative,
          cheapAlternative,
          stylizedAlternative,
        ]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prioritize: 'quality',
          prompt: 'A test image',
        };

        const result = await service.selectModel(options);

        expect(result.selectedModel).toBe('selected-model');
        const alternativeReasons = result.alternatives.map((a) => a.reason);
        expect(alternativeReasons.some((r) => r.length > 0)).toBe(true);
      });
    });

    describe('Reason Generation', () => {
      it('should generate reason for quality optimization', async () => {
        const model = createMockModel({
          category: ModelCategory.IMAGE,
          qualityTier: 'ultra',
        });
        modelsService.findAllActive.mockResolvedValue([model]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prioritize: 'quality',
          prompt: 'A test',
        };

        const result = await service.selectModel(options);

        expect(result.reason).toContain('quality');
      });

      it('should generate reason for speed optimization', async () => {
        const model = createMockModel({
          category: ModelCategory.IMAGE,
          speedTier: 'fast',
        });
        modelsService.findAllActive.mockResolvedValue([model]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prioritize: 'speed',
          prompt: 'A test',
        };

        const result = await service.selectModel(options);

        expect(result.reason).toContain('speed');
      });

      it('should generate reason for cost optimization', async () => {
        const model = createMockModel({
          category: ModelCategory.IMAGE,
          costTier: 'low',
        });
        modelsService.findAllActive.mockResolvedValue([model]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prioritize: 'cost',
          prompt: 'A test',
        };

        const result = await service.selectModel(options);

        expect(result.reason).toContain('cost');
      });

      it('should generate balanced reason when no specific optimization', async () => {
        const model = createMockModel({ category: ModelCategory.IMAGE });
        modelsService.findAllActive.mockResolvedValue([model]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt: 'test',
        };

        const result = await service.selectModel(options);

        expect(result.reason).toBe('balanced performance and quality');
      });

      it('should include detected features in reason', async () => {
        const model = createMockModel({ category: ModelCategory.IMAGE });
        modelsService.findAllActive.mockResolvedValue([model]);

        const options: ModelSelectionOptions = {
          category: ModelCategory.IMAGE,
          prompt: 'A photorealistic cinematic scene',
        };

        const result = await service.selectModel(options);

        expect(result.reason).toContain('supports');
      });
    });
  });

  describe('getDefaultModel', () => {
    it('should return default model from database when available', async () => {
      const defaultModel = createMockModel({
        category: ModelCategory.IMAGE,
        isDefault: true,
        key: 'database-default',
      });

      modelsService.findOne.mockResolvedValue(defaultModel);

      const result = await service.getDefaultModel(ModelCategory.IMAGE);

      expect(result).toBe('database-default');
      expect(modelsService.findOne).toHaveBeenCalledWith({
        category: ModelCategory.IMAGE,
        isDefault: true,
        isDeleted: false,
      });
    });

    it('should return fallback for IMAGE category when no database default', async () => {
      modelsService.findOne.mockResolvedValue(null);

      const result = await service.getDefaultModel(ModelCategory.IMAGE);

      expect(result).toBe(ModelKey.REPLICATE_GOOGLE_NANO_BANANA);
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('should return fallback for VIDEO category when no database default', async () => {
      modelsService.findOne.mockResolvedValue(null);

      const result = await service.getDefaultModel(ModelCategory.VIDEO);

      expect(result).toBe(ModelKey.REPLICATE_GOOGLE_VEO_3_1);
    });

    it('should return fallback for TEXT category when no database default', async () => {
      modelsService.findOne.mockResolvedValue(null);

      const result = await service.getDefaultModel(ModelCategory.TEXT);

      expect(result).toBe(DEFAULT_TEXT_MODEL);
    });

    it('should return fallback for IMAGE_EDIT category when no database default', async () => {
      modelsService.findOne.mockResolvedValue(null);

      const result = await service.getDefaultModel(ModelCategory.IMAGE_EDIT);

      expect(result).toBe(ModelKey.REPLICATE_LUMA_REFRAME_IMAGE);
    });

    it('should return fallback for IMAGE_UPSCALE category when no database default', async () => {
      modelsService.findOne.mockResolvedValue(null);

      const result = await service.getDefaultModel(ModelCategory.IMAGE_UPSCALE);

      expect(result).toBe(ModelKey.REPLICATE_TOPAZ_IMAGE_UPSCALE);
    });

    it('should return fallback for VIDEO_EDIT category when no database default', async () => {
      modelsService.findOne.mockResolvedValue(null);

      const result = await service.getDefaultModel(ModelCategory.VIDEO_EDIT);

      expect(result).toBe(ModelKey.REPLICATE_LUMA_REFRAME_VIDEO);
    });

    it('should return fallback for VIDEO_UPSCALE category when no database default', async () => {
      modelsService.findOne.mockResolvedValue(null);

      const result = await service.getDefaultModel(ModelCategory.VIDEO_UPSCALE);

      expect(result).toBe(ModelKey.REPLICATE_TOPAZ_VIDEO_UPSCALE);
    });

    it('should return fallback for MUSIC category when no database default', async () => {
      modelsService.findOne.mockResolvedValue(null);

      const result = await service.getDefaultModel(ModelCategory.MUSIC);

      expect(result).toBe(ModelKey.REPLICATE_META_MUSICGEN);
    });

    it('should return fallback for VOICE category when no database default', async () => {
      modelsService.findOne.mockResolvedValue(null);

      const result = await service.getDefaultModel(ModelCategory.VOICE);

      expect(result).toBe('elevenlabs');
    });
  });

  describe('Keyword Matching', () => {
    it('should score models based on recommendedFor matching detected features', async () => {
      const matchingModel = createMockModel({
        category: ModelCategory.IMAGE,
        key: 'matching-model',
        recommendedFor: ['photorealistic', 'portrait'],
      });

      const nonMatchingModel = createMockModel({
        category: ModelCategory.IMAGE,
        key: 'non-matching-model',
        recommendedFor: ['cartoon', 'anime'],
      });

      modelsService.findAllActive.mockResolvedValue([
        nonMatchingModel,
        matchingModel,
      ]);

      const options: ModelSelectionOptions = {
        category: ModelCategory.IMAGE,
        prompt: 'A photorealistic portrait',
      };

      const result = await service.selectModel(options);

      expect(result.selectedModel).toBe('matching-model');
    });

    it('should score models based on recommendedFor matching prompt keywords', async () => {
      const matchingModel = createMockModel({
        category: ModelCategory.IMAGE,
        key: 'matching-model',
        recommendedFor: ['sunset', 'landscape'],
      });

      const nonMatchingModel = createMockModel({
        category: ModelCategory.IMAGE,
        key: 'non-matching-model',
        recommendedFor: ['portrait'],
      });

      modelsService.findAllActive.mockResolvedValue([
        nonMatchingModel,
        matchingModel,
      ]);

      const options: ModelSelectionOptions = {
        category: ModelCategory.IMAGE,
        prompt: 'A beautiful sunset over the landscape',
      };

      const result = await service.selectModel(options);

      expect(result.selectedModel).toBe('matching-model');
    });
  });

  describe('Model Details', () => {
    it('should include correct model details in recommendation', async () => {
      const model = createMockModel({
        _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
        category: ModelCategory.IMAGE,
        cost: 100,
        key: 'test-model-key',
        provider: 'test-provider',
      });

      modelsService.findAllActive.mockResolvedValue([model]);

      const options: ModelSelectionOptions = {
        category: ModelCategory.IMAGE,
        prompt: 'A test image',
      };

      const result = await service.selectModel(options);

      expect(result.modelDetails).toEqual({
        category: ModelCategory.IMAGE,
        cost: 100,
        id: '507f1f77bcf86cd799439011',
        key: 'test-model-key',
        provider: 'test-provider',
      });
    });
  });

  describe('Artistic Capabilities', () => {
    it('should prefer models with artistic capability for artistic prompts', async () => {
      const artisticModel = createMockModel({
        capabilities: ['artistic'],
        category: ModelCategory.IMAGE,
        key: 'artistic-model',
      });

      const normalModel = createMockModel({
        capabilities: [],
        category: ModelCategory.IMAGE,
        key: 'normal-model',
      });

      modelsService.findAllActive.mockResolvedValue([
        normalModel,
        artisticModel,
      ]);

      const options: ModelSelectionOptions = {
        category: ModelCategory.IMAGE,
        prompt: 'An artistic watercolor painting',
      };

      const result = await service.selectModel(options);

      expect(result.selectedModel).toBe('artistic-model');
    });

    it('should prefer models with creative capability for stylized prompts', async () => {
      const creativeModel = createMockModel({
        capabilities: ['creative'],
        category: ModelCategory.IMAGE,
        key: 'creative-model',
      });

      const normalModel = createMockModel({
        capabilities: [],
        category: ModelCategory.IMAGE,
        key: 'normal-model',
      });

      modelsService.findAllActive.mockResolvedValue([
        normalModel,
        creativeModel,
      ]);

      const options: ModelSelectionOptions = {
        category: ModelCategory.IMAGE,
        prompt: 'A sketch illustration',
      };

      const result = await service.selectModel(options);

      expect(result.selectedModel).toBe('creative-model');
    });
  });
});
