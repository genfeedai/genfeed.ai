import { EvaluationsOperationsService } from '@api/collections/evaluations/services/evaluations-operations.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { ConfigService } from '@api/config/config.service';
import { ExternalServiceException } from '@api/helpers/exceptions/external/external-service.exception';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('EvaluationsOperationsService', () => {
  let service: EvaluationsOperationsService;
  let _configService: ConfigService;
  let _replicateService: ReplicateService;
  let _promptBuilderService: PromptBuilderService;
  let loggerService: LoggerService;

  const mockServices = {
    configService: {
      get: vi.fn((key?: string) => {
        if (key === 'MAX_TOKENS') {
          return 1000;
        }
        return 'test-value';
      }),
    },
    loggerService: {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    },
    modelsService: {
      findOne: vi.fn().mockResolvedValue({
        inputTokenPricePerMillion: 1,
        key: 'openai/gpt-5',
        minCost: 1,
        outputTokenPricePerMillion: 1,
        pricingType: 'per-token',
      }),
    },
    promptBuilderService: {
      buildPrompt: vi.fn(),
    },
    replicateService: {
      generateTextCompletionSync: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvaluationsOperationsService,
        { provide: ConfigService, useValue: mockServices.configService },
        { provide: ModelsService, useValue: mockServices.modelsService },
        { provide: ReplicateService, useValue: mockServices.replicateService },
        {
          provide: PromptBuilderService,
          useValue: mockServices.promptBuilderService,
        },
        { provide: LoggerService, useValue: mockServices.loggerService },
      ],
    }).compile();

    service = module.get<EvaluationsOperationsService>(
      EvaluationsOperationsService,
    );
    _configService = module.get<ConfigService>(ConfigService);
    _replicateService = module.get<ReplicateService>(ReplicateService);
    _promptBuilderService =
      module.get<PromptBuilderService>(PromptBuilderService);
    loggerService = module.get<LoggerService>(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('evaluateVideo', () => {
    const organizationId = '507f1f77bcf86cd799439011';

    it('should evaluate video content', async () => {
      const mockAiResponse = {
        overallScore: 85,
        scores: {
          brand: { overall: 80 },
          engagement: { overall: 90 },
          technical: { overall: 85 },
        },
        strengths: ['Great video content'],
        suggestions: [],
        weaknesses: [],
      };

      mockServices.promptBuilderService.buildPrompt.mockResolvedValue({
        input: { prompt: 'built prompt' },
        templateUsed: null,
        templateVersion: null,
      });

      mockServices.replicateService.generateTextCompletionSync.mockResolvedValue(
        JSON.stringify(mockAiResponse),
      );

      const result = await service.evaluateVideo(
        'https://example.com/video.mp4',
        {
          brand: { label: 'Test Brand' },
          platform: 'youtube',
          prompt: 'Test prompt',
        },
        organizationId,
      );

      expect(mockServices.promptBuilderService.buildPrompt).toHaveBeenCalled();
      expect(
        mockServices.replicateService.generateTextCompletionSync,
      ).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.overallScore).toBe(85);
    });

    it('should throw error when services not initialized', async () => {
      const serviceWithoutServices = new EvaluationsOperationsService(
        undefined as unknown as string,
        undefined as unknown as string,
        undefined as unknown as string,
        undefined as unknown as string,
        loggerService,
      );

      await expect(
        serviceWithoutServices.evaluateVideo(
          'https://example.com/video.mp4',
          {},
          organizationId,
        ),
      ).rejects.toThrow();
    });

    it('should handle Replicate API errors', async () => {
      const error = new Error('API Error');
      mockServices.promptBuilderService.buildPrompt.mockResolvedValue({
        input: { prompt: 'built prompt' },
        templateUsed: null,
        templateVersion: null,
      });
      mockServices.replicateService.generateTextCompletionSync.mockRejectedValue(
        error,
      );

      await expect(
        service.evaluateVideo(
          'https://example.com/video.mp4',
          {},
          organizationId,
        ),
      ).rejects.toThrow(ExternalServiceException);
    });
  });

  describe('evaluateImage', () => {
    const organizationId = '507f1f77bcf86cd799439011';

    it('should evaluate image content', async () => {
      const mockAiResponse = {
        overallScore: 90,
        scores: {
          brand: { overall: 85 },
          engagement: { overall: 95 },
          technical: { overall: 90 },
        },
        strengths: ['Great image content'],
        suggestions: [],
        weaknesses: [],
      };

      mockServices.promptBuilderService.buildPrompt.mockResolvedValue({
        input: { prompt: 'built prompt' },
        templateUsed: null,
        templateVersion: null,
      });

      mockServices.replicateService.generateTextCompletionSync.mockResolvedValue(
        JSON.stringify(mockAiResponse),
      );

      const result = await service.evaluateImage(
        'https://example.com/image.jpg',
        {
          brand: { label: 'Test Brand' },
          platform: 'instagram',
          prompt: 'Test prompt',
        },
        organizationId,
      );

      expect(mockServices.promptBuilderService.buildPrompt).toHaveBeenCalled();
      expect(
        mockServices.replicateService.generateTextCompletionSync,
      ).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.overallScore).toBe(90);
    });

    it('should handle Replicate API errors', async () => {
      const error = new Error('API Error');
      mockServices.promptBuilderService.buildPrompt.mockResolvedValue({
        input: { prompt: 'built prompt' },
        templateUsed: null,
        templateVersion: null,
      });
      mockServices.replicateService.generateTextCompletionSync.mockRejectedValue(
        error,
      );

      await expect(
        service.evaluateImage(
          'https://example.com/image.jpg',
          {},
          organizationId,
        ),
      ).rejects.toThrow(ExternalServiceException);
    });
  });

  describe('evaluateArticle', () => {
    const organizationId = '507f1f77bcf86cd799439011';

    it('should evaluate article content', async () => {
      const mockAiResponse = {
        overallScore: 88,
        scores: {
          brand: { overall: 85 },
          engagement: { overall: 90 },
          technical: { overall: 88 },
        },
        strengths: ['Great article content'],
        suggestions: [],
        weaknesses: [],
      };

      mockServices.promptBuilderService.buildPrompt.mockResolvedValue({
        input: { prompt: 'built prompt' },
        templateUsed: null,
        templateVersion: null,
      });

      mockServices.replicateService.generateTextCompletionSync.mockResolvedValue(
        JSON.stringify(mockAiResponse),
      );

      const result = await service.evaluateArticle(
        'Test article content',
        {
          brand: { label: 'Test Brand' },
          platform: 'medium',
        },
        organizationId,
      );

      expect(mockServices.promptBuilderService.buildPrompt).toHaveBeenCalled();
      expect(
        mockServices.replicateService.generateTextCompletionSync,
      ).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.overallScore).toBe(88);
    });
  });
});
