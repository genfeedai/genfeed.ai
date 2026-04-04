import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SelectModelDto } from '@api/services/router/dto/select-model.dto';
import type {
  ModelRecommendation,
  PromptAnalysis,
} from '@api/services/router/interfaces/router.interfaces';
import { RouterController } from '@api/services/router/router.controller';
import { RouterService } from '@api/services/router/router.service';
import { ModelCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('RouterController', () => {
  let controller: RouterController;
  let routerService: vi.Mocked<RouterService>;
  let loggerService: vi.Mocked<LoggerService>;

  const createMockAnalysis = (
    overrides: Partial<PromptAnalysis> = {},
  ): PromptAnalysis => ({
    complexity: 'medium',
    detectedFeatures: [],
    estimatedLength: 20,
    hasQualityIndicators: false,
    hasSpecificStyle: false,
    hasSpeedIndicators: false,
    keywords: ['test'],
    ...overrides,
  });

  const createMockRecommendation = (
    overrides: Partial<ModelRecommendation> = {},
  ): ModelRecommendation => ({
    alternatives: [
      {
        model: 'stability/stable-diffusion-xl',
        reason: 'Fast generation, lower cost',
        score: 85,
      },
    ],
    analysis: createMockAnalysis(),
    modelDetails: {
      category: ModelCategory.IMAGE,
      cost: 5,
      id: '507f1f77bcf86cd799439011',
      key: 'google/imagen-4',
      provider: 'google',
    },
    reason: 'Optimized for quality, high-quality prompt detected',
    selectedModel: 'google/imagen-4',
    ...overrides,
  });

  beforeEach(async () => {
    const mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const mockRouterService = {
      getDefaultModel: vi.fn(),
      selectModel: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RouterController],
      providers: [
        {
          provide: RouterService,
          useValue: mockRouterService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RouterController>(RouterController);
    routerService = module.get(RouterService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('controller definition', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });
  });

  describe('selectModel', () => {
    describe('basic functionality', () => {
      it('should select optimal model for image generation', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          prioritize: 'quality',
          prompt: 'Create a photorealistic image of a sunset over mountains',
        };

        const mockRecommendation = createMockRecommendation();
        routerService.selectModel.mockResolvedValue(mockRecommendation);

        const result = await controller.selectModel(selectModelDto);

        expect(routerService.selectModel).toHaveBeenCalledWith({
          category: selectModelDto.category,
          dimensions: undefined,
          duration: undefined,
          outputs: undefined,
          prioritize: selectModelDto.prioritize,
          prompt: selectModelDto.prompt,
          speech: undefined,
        });
        expect(result).toEqual(mockRecommendation);
        expect(result.selectedModel).toBe('google/imagen-4');
        expect(result.modelDetails).toBeDefined();
        expect(result.alternatives).toHaveLength(1);
      });

      it('should select model prioritizing speed', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          prioritize: 'speed',
          prompt: 'Quick sketch of a cat',
        };

        const speedRecommendation = createMockRecommendation({
          reason: 'Fast generation optimized',
          selectedModel: 'stability/stable-diffusion-xl',
        });

        routerService.selectModel.mockResolvedValue(speedRecommendation);

        const result = await controller.selectModel(selectModelDto);

        expect(result.selectedModel).toBe('stability/stable-diffusion-xl');
        expect(loggerService.debug).toHaveBeenCalled();
        expect(loggerService.log).toHaveBeenCalled();
      });

      it('should select model prioritizing cost', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          prioritize: 'cost',
          prompt: 'Simple cartoon',
        };

        const costRecommendation = createMockRecommendation({
          reason: 'Optimized for cost',
          selectedModel: 'cheap-model',
        });

        routerService.selectModel.mockResolvedValue(costRecommendation);

        const result = await controller.selectModel(selectModelDto);

        expect(result.selectedModel).toBe('cheap-model');
      });

      it('should select model with balanced priority by default', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          prompt: 'A beautiful landscape',
        };

        const balancedRecommendation = createMockRecommendation({
          reason: 'balanced performance and quality',
        });

        routerService.selectModel.mockResolvedValue(balancedRecommendation);

        const result = await controller.selectModel(selectModelDto);

        expect(routerService.selectModel).toHaveBeenCalledWith(
          expect.objectContaining({
            prioritize: undefined,
          }),
        );
        expect(result.reason).toContain('balanced');
      });
    });

    describe('with dimensions', () => {
      it('should select model with dimensions', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          dimensions: { height: 1024, width: 1024 },
          prompt: 'Generate an image',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(routerService.selectModel).toHaveBeenCalledWith(
          expect.objectContaining({
            dimensions: { height: 1024, width: 1024 },
          }),
        );
        expect(result).toBeDefined();
      });

      it('should select model with only width dimension', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          dimensions: { width: 2048 },
          prompt: 'Generate an image',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(routerService.selectModel).toHaveBeenCalledWith(
          expect.objectContaining({
            dimensions: { width: 2048 },
          }),
        );
        expect(result).toBeDefined();
      });

      it('should select model with only height dimension', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          dimensions: { height: 2048 },
          prompt: 'Generate an image',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(routerService.selectModel).toHaveBeenCalledWith(
          expect.objectContaining({
            dimensions: { height: 2048 },
          }),
        );
        expect(result).toBeDefined();
      });

      it('should select model with large dimensions', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          dimensions: { height: 4096, width: 4096 },
          prompt: 'Generate a high-res image',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(routerService.selectModel).toHaveBeenCalledWith(
          expect.objectContaining({
            dimensions: { height: 4096, width: 4096 },
          }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('video generation', () => {
      it('should select model for video generation with duration', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.VIDEO,
          duration: 10,
          prompt: 'Generate a video of a bird flying',
        };

        const videoRecommendation = createMockRecommendation({
          modelDetails: {
            category: ModelCategory.VIDEO,
            cost: 10,
            id: '507f1f77bcf86cd799439011',
            key: 'runway/gen-3',
            provider: 'runway',
          },
          reason: 'Best for video generation',
          selectedModel: 'runway/gen-3',
        });

        routerService.selectModel.mockResolvedValue(videoRecommendation);

        const result = await controller.selectModel(selectModelDto);

        expect(routerService.selectModel).toHaveBeenCalledWith(
          expect.objectContaining({
            category: ModelCategory.VIDEO,
            duration: 10,
          }),
        );
        expect(result.selectedModel).toBe('runway/gen-3');
      });

      it('should select model for video with speech', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.VIDEO,
          prompt: 'Generate speech saying hello world',
          speech: 'Hello world',
        };

        const speechRecommendation = createMockRecommendation({
          reason: 'Best for text-to-speech',
          selectedModel: 'google/veo-3',
        });

        routerService.selectModel.mockResolvedValue(speechRecommendation);

        const result = await controller.selectModel(selectModelDto);

        expect(routerService.selectModel).toHaveBeenCalledWith(
          expect.objectContaining({
            category: ModelCategory.VIDEO,
            speech: 'Hello world',
          }),
        );
        expect(result).toBeDefined();
      });

      it('should select model for video with both duration and speech', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.VIDEO,
          duration: 30,
          prompt: 'A video with narration',
          speech: 'This is the narration text',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(routerService.selectModel).toHaveBeenCalledWith(
          expect.objectContaining({
            duration: 30,
            speech: 'This is the narration text',
          }),
        );
        expect(result).toBeDefined();
      });

      it('should select model for short video clips', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.VIDEO,
          duration: 4,
          prompt: 'A short video clip',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(routerService.selectModel).toHaveBeenCalledWith(
          expect.objectContaining({
            duration: 4,
          }),
        );
        expect(result).toBeDefined();
      });

      it('should select model for long video clips', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.VIDEO,
          duration: 60,
          prompt: 'A long cinematic video',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(routerService.selectModel).toHaveBeenCalledWith(
          expect.objectContaining({
            duration: 60,
          }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('outputs parameter', () => {
      it('should select model with outputs parameter', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          outputs: 4,
          prompt: 'Generate multiple variations',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(routerService.selectModel).toHaveBeenCalledWith(
          expect.objectContaining({
            outputs: 4,
          }),
        );
        expect(result).toBeDefined();
      });

      it('should handle single output', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          outputs: 1,
          prompt: 'Generate one image',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(routerService.selectModel).toHaveBeenCalledWith(
          expect.objectContaining({
            outputs: 1,
          }),
        );
        expect(result).toBeDefined();
      });
    });

    describe('prompt analysis', () => {
      it('should handle complex prompts with quality indicators', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          prioritize: 'quality',
          prompt:
            'Create a photorealistic 8K image of a futuristic cityscape at sunset with neon lights, flying cars, and detailed architecture in the style of Blade Runner',
        };

        const complexRecommendation = createMockRecommendation({
          analysis: createMockAnalysis({
            complexity: 'complex',
            detectedFeatures: [
              'photorealistic',
              'detailed',
              'high-resolution',
              'cinematic',
            ],
            hasQualityIndicators: true,
            hasSpeedIndicators: false,
          }),
        });

        routerService.selectModel.mockResolvedValue(complexRecommendation);

        const result = await controller.selectModel(selectModelDto);

        expect(result.analysis.complexity).toBe('complex');
        expect(result.analysis.hasQualityIndicators).toBe(true);
        expect(result.analysis.detectedFeatures).toContain('photorealistic');
      });

      it('should handle simple prompts', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          prompt: 'A cat',
        };

        const simpleRecommendation = createMockRecommendation({
          analysis: createMockAnalysis({
            complexity: 'simple',
            estimatedLength: 5,
          }),
        });

        routerService.selectModel.mockResolvedValue(simpleRecommendation);

        const result = await controller.selectModel(selectModelDto);

        expect(result.analysis.complexity).toBe('simple');
      });

      it('should handle prompts with style indicators', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          prompt: 'An anime style character with blue hair',
        };

        const styleRecommendation = createMockRecommendation({
          analysis: createMockAnalysis({
            detectedFeatures: ['artistic'],
            hasSpecificStyle: true,
          }),
        });

        routerService.selectModel.mockResolvedValue(styleRecommendation);

        const result = await controller.selectModel(selectModelDto);

        expect(result.analysis.hasSpecificStyle).toBe(true);
      });

      it('should handle prompts with speed indicators', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          prompt: 'A quick simple sketch draft',
        };

        const speedRecommendation = createMockRecommendation({
          analysis: createMockAnalysis({
            complexity: 'simple',
            hasSpeedIndicators: true,
          }),
        });

        routerService.selectModel.mockResolvedValue(speedRecommendation);

        const result = await controller.selectModel(selectModelDto);

        expect(result.analysis.hasSpeedIndicators).toBe(true);
      });
    });

    describe('logging', () => {
      it('should log request details at start', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          prompt: 'Test prompt',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        await controller.selectModel(selectModelDto);

        expect(loggerService.debug).toHaveBeenCalledWith(
          expect.stringContaining('selectModel started'),
          expect.objectContaining({
            category: ModelCategory.IMAGE,
            promptLength: 11,
          }),
        );
      });

      it('should log completion details', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          prompt: 'Test prompt',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        await controller.selectModel(selectModelDto);

        expect(loggerService.log).toHaveBeenCalledWith(
          expect.stringContaining('selectModel completed'),
          expect.objectContaining({
            category: ModelCategory.IMAGE,
            selectedModel: 'google/imagen-4',
          }),
        );
      });

      it('should log different category types', async () => {
        const videoDto: SelectModelDto = {
          category: ModelCategory.VIDEO,
          prompt: 'Video test',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        await controller.selectModel(videoDto);

        expect(loggerService.debug).toHaveBeenCalledWith(
          expect.stringContaining('selectModel started'),
          expect.objectContaining({
            category: ModelCategory.VIDEO,
          }),
        );
      });
    });

    describe('error handling', () => {
      it('should propagate NotFoundException from service', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          prompt: 'Test',
        };

        routerService.selectModel.mockRejectedValue(
          new NotFoundException('No models available'),
        );

        await expect(controller.selectModel(selectModelDto)).rejects.toThrow(
          NotFoundException,
        );
      });

      it('should propagate generic errors from service', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          prompt: 'Test',
        };

        routerService.selectModel.mockRejectedValue(
          new Error('Database error'),
        );

        await expect(controller.selectModel(selectModelDto)).rejects.toThrow(
          'Database error',
        );
      });
    });

    describe('all categories', () => {
      it('should handle IMAGE category', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE,
          prompt: 'An image',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(result).toBeDefined();
      });

      it('should handle VIDEO category', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.VIDEO,
          prompt: 'A video',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(result).toBeDefined();
      });

      it('should handle TEXT category', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.TEXT,
          prompt: 'Generate text',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(result).toBeDefined();
      });

      it('should handle IMAGE_EDIT category', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE_EDIT,
          prompt: 'Edit an image',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(result).toBeDefined();
      });

      it('should handle VIDEO_EDIT category', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.VIDEO_EDIT,
          prompt: 'Edit a video',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(result).toBeDefined();
      });

      it('should handle IMAGE_UPSCALE category', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.IMAGE_UPSCALE,
          prompt: 'Upscale an image',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(result).toBeDefined();
      });

      it('should handle VIDEO_UPSCALE category', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.VIDEO_UPSCALE,
          prompt: 'Upscale a video',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(result).toBeDefined();
      });

      it('should handle MUSIC category', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.MUSIC,
          prompt: 'Generate music',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(result).toBeDefined();
      });

      it('should handle VOICE category', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.VOICE,
          prompt: 'Generate voice',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(result).toBeDefined();
      });
    });

    describe('combined parameters', () => {
      it('should handle all parameters combined', async () => {
        const selectModelDto: SelectModelDto = {
          category: ModelCategory.VIDEO,
          dimensions: { height: 1080, width: 1920 },
          duration: 30,
          outputs: 2,
          prioritize: 'quality',
          prompt: 'A complex prompt',
          speech: 'Narration text',
        };

        routerService.selectModel.mockResolvedValue(createMockRecommendation());

        const result = await controller.selectModel(selectModelDto);

        expect(routerService.selectModel).toHaveBeenCalledWith({
          category: ModelCategory.VIDEO,
          dimensions: { height: 1080, width: 1920 },
          duration: 30,
          outputs: 2,
          prioritize: 'quality',
          prompt: 'A complex prompt',
          speech: 'Narration text',
        });
        expect(result).toBeDefined();
      });
    });
  });
});
