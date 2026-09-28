import { EvaluationsOperationsService } from '@api/collections/evaluations/services/evaluations-operations.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { ExternalServiceException } from '@api/helpers/exceptions/external/external-service.exception';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { ByokProvider } from '@genfeedai/contracts';
import type { IEvaluationScores } from '@genfeedai/contracts/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('EvaluationsOperationsService', () => {
  let service: EvaluationsOperationsService;
  let _configService: ConfigService;
  let _replicateService: ReplicateService;
  let _promptBuilderService: PromptBuilderService;
  let loggerService: LoggerService;

  const mockServices = {
    filesClientService: {
      extractMetadataFromUrl: vi.fn(),
      generateThumbnail: vi.fn(),
    },
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
        {
          provide: FilesClientService,
          useValue: mockServices.filesClientService,
        },
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

  describe('BYOK dispatch (#5380)', () => {
    beforeEach(() => {
      mockServices.promptBuilderService.buildPrompt.mockResolvedValue({
        input: { prompt: 'built prompt' },
      });
      mockServices.replicateService.generateTextCompletionSync.mockResolvedValue(
        JSON.stringify({ overallScore: 70 }),
      );
    });

    it("dispatches on the org's key and bills nothing", async () => {
      const onBilling = vi.fn();

      await service.evaluateArticle(
        'Article body',
        {},
        testId('org'),
        onBilling,
        { keys: { [ByokProvider.OPENROUTER]: 'org-or-key' } },
      );

      expect(
        mockServices.replicateService.generateTextCompletionSync,
      ).toHaveBeenCalledWith(
        DEFAULT_TEXT_MODEL,
        expect.any(Object),
        'org-or-key',
      );
      expect(onBilling).not.toHaveBeenCalled();
    });

    it('dispatches on the platform key and bills the charge otherwise', async () => {
      const onBilling = vi.fn();

      await service.evaluateArticle(
        'Article body',
        {},
        testId('org'),
        onBilling,
      );

      expect(
        mockServices.replicateService.generateTextCompletionSync,
      ).toHaveBeenCalledWith(DEFAULT_TEXT_MODEL, expect.any(Object), undefined);
      expect(onBilling).toHaveBeenCalledWith(expect.any(Number));
    });
  });

  describe('evaluateVideo', () => {
    const organizationId = testId('org');

    beforeEach(() => {
      mockServices.filesClientService.extractMetadataFromUrl.mockResolvedValue({
        duration: 20,
      });
      mockServices.filesClientService.generateThumbnail.mockImplementation(
        (_url: string, frameId: string) =>
          Promise.resolve({
            ingredientId: frameId,
            thumbnailUrl: `https://cdn.test/${frameId}.jpg`,
          }),
      );
    });

    it('evaluates sampled frames as images and never sends the video to the text model', async () => {
      mockServices.promptBuilderService.buildPrompt.mockResolvedValue({
        input: { prompt: 'built prompt' },
      });
      mockServices.replicateService.generateTextCompletionSync.mockResolvedValue(
        JSON.stringify({ overallScore: 70 }),
      );

      await service.evaluateVideo(
        'https://example.com/video.mp4',
        { prompt: 'Test prompt' },
        organizationId,
      );

      const thumbnailCalls =
        mockServices.filesClientService.generateThumbnail.mock.calls;
      expect(thumbnailCalls.map((call) => call[2])).toEqual([
        2.5, 7.5, 12.5, 17.5,
      ]);
      for (const call of thumbnailCalls) {
        expect(call[0]).toBe('https://example.com/video.mp4');
        expect(call[1]).toMatch(/^evaluation-frame-/);
      }
      const [model, input] =
        mockServices.replicateService.generateTextCompletionSync.mock.calls[0];
      expect(model).toBe(DEFAULT_TEXT_MODEL);
      expect(input).not.toHaveProperty('videos');
      expect(input.images).toEqual(
        thumbnailCalls.map((call) => `https://cdn.test/${call[1]}.jpg`),
      );
    });

    it('fails without billing when frames cannot be sampled', async () => {
      mockServices.filesClientService.extractMetadataFromUrl.mockResolvedValue(
        {},
      );
      const onBilling = vi.fn();

      await expect(
        service.evaluateVideo(
          'https://example.com/video.mp4',
          {},
          organizationId,
          onBilling,
        ),
      ).rejects.toThrow(ExternalServiceException);
      expect(
        mockServices.replicateService.generateTextCompletionSync,
      ).not.toHaveBeenCalled();
      expect(onBilling).not.toHaveBeenCalled();
    });

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
        undefined as unknown as FilesClientService,
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

    it('normalizes a complete persuasion result onto the stored scores', async () => {
      const mockAiResponse = {
        overallScore: 85,
        scores: {
          brand: { overall: 80 },
          engagement: { overall: 90 },
          persuasion: {
            ctaNaturalness: 60,
            demandFit: 80,
            hookStrength: 100,
            openLoopIntegrity: 40,
            overall: 1,
          },
          technical: { overall: 85 },
        },
        strengths: [],
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

      const result = (await service.evaluateVideo(
        'https://example.com/video.mp4',
        {},
        organizationId,
      )) as { scores: IEvaluationScores };

      expect(result.scores.persuasion).toEqual({
        ctaNaturalness: 60,
        demandFit: 80,
        hookStrength: 100,
        openLoopIntegrity: 40,
        overall: 70,
      });
    });

    it('drops an incomplete persuasion result without touching the other scores', async () => {
      const mockAiResponse = {
        overallScore: 85,
        scores: {
          brand: { overall: 80 },
          engagement: { overall: 90 },
          persuasion: {
            ctaNaturalness: 60,
            demandFit: 80,
            // hookStrength and openLoopIntegrity missing -- incomplete
          },
          technical: { overall: 85 },
        },
        strengths: [],
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

      const result = (await service.evaluateVideo(
        'https://example.com/video.mp4',
        {},
        organizationId,
      )) as { scores: IEvaluationScores };

      expect(result.scores.persuasion).toBeUndefined();
      expect(result.scores.brand).toEqual({ overall: 80 });
      expect(result.scores.engagement).toEqual({ overall: 90 });
      expect(result.scores.technical).toEqual({ overall: 85 });
    });
  });

  describe('evaluateImage', () => {
    const organizationId = testId('org');

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
    const organizationId = testId('org');

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
