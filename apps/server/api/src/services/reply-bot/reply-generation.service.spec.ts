import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ReplyGenerationService', () => {
  let service: ReplyGenerationService;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockPromptBuilderService = {
    buildPrompt: vi.fn(),
  };

  const mockReplicateService = {
    generateTextCompletionSync: vi.fn(),
  };

  const mockCreditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
    deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
  };

  const mockModelsService = {
    findOne: vi.fn().mockResolvedValue({
      inputTokenPricePerMillion: 1,
      key: 'openai/gpt-5',
      minCost: 1,
      outputTokenPricePerMillion: 1,
      pricingType: 'per-token',
    }),
  };

  const mockTemplatesService = {
    getPromptByKey: vi.fn(),
    getRenderedPrompt: vi.fn(),
    renderPrompt: vi.fn(),
    updateMetadata: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplyGenerationService,
        { provide: CreditsUtilsService, useValue: mockCreditsUtilsService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: ModelsService, useValue: mockModelsService },
        { provide: PromptBuilderService, useValue: mockPromptBuilderService },
        { provide: ReplicateService, useValue: mockReplicateService },
        { provide: TemplatesService, useValue: mockTemplatesService },
      ],
    }).compile();

    service = module.get<ReplyGenerationService>(ReplyGenerationService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateReply', () => {
    const baseOptions = {
      length: 'short' as const,
      organizationId: 'org-123',
      tone: 'professional' as const,
      tweetAuthor: '@testuser',
      tweetContent: 'This is a test tweet',
      userId: 'user-123',
    };

    it('should generate a reply using AI services', async () => {
      mockTemplatesService.getRenderedPrompt.mockResolvedValue(
        'rendered prompt',
      );
      mockPromptBuilderService.buildPrompt.mockResolvedValue({
        input: { prompt: 'built prompt' },
      });
      mockReplicateService.generateTextCompletionSync.mockResolvedValue(
        '  AI generated reply  ',
      );

      const result = await service.generateReply(baseOptions);

      expect(result).toBe('AI generated reply');
      expect(mockTemplatesService.getRenderedPrompt).toHaveBeenCalled();
      expect(mockPromptBuilderService.buildPrompt).toHaveBeenCalled();
      expect(
        mockReplicateService.generateTextCompletionSync,
      ).toHaveBeenCalled();
    });

    it('should pass custom instructions and context when provided', async () => {
      mockTemplatesService.getRenderedPrompt.mockResolvedValue(
        'rendered prompt',
      );
      mockPromptBuilderService.buildPrompt.mockResolvedValue({ input: {} });
      mockReplicateService.generateTextCompletionSync.mockResolvedValue(
        'reply',
      );

      await service.generateReply({
        ...baseOptions,
        context: 'Brand context info',
        customInstructions: 'Be brief',
      });

      expect(mockTemplatesService.getRenderedPrompt).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          context: 'Brand context info',
          customInstructions: 'Be brief',
        }),
        'org-123',
      );
    });

    it('should return a fallback reply when AI generation fails', async () => {
      mockTemplatesService.getRenderedPrompt.mockRejectedValue(
        new Error('AI error'),
      );

      const result = await service.generateReply(baseOptions);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(mockLoggerService.error).toHaveBeenCalled();
    });
  });

  describe('generateDm', () => {
    const dmOptions = {
      organizationId: 'org-123',
      replyText: 'My reply text',
      tweetAuthor: 'author123',
      tweetContent: 'Original tweet',
      userId: 'user-123',
    };

    it('should generate a DM using AI services', async () => {
      mockPromptBuilderService.buildPrompt.mockResolvedValue({ input: {} });
      mockReplicateService.generateTextCompletionSync.mockResolvedValue(
        '  Hey! Thanks for engaging  ',
      );

      const result = await service.generateDm(dmOptions);

      expect(result).toBe('Hey! Thanks for engaging');
      expect(mockPromptBuilderService.buildPrompt).toHaveBeenCalled();
    });

    it('should return a fallback DM when AI generation fails', async () => {
      mockPromptBuilderService.buildPrompt.mockRejectedValue(
        new Error('DM gen failed'),
      );

      const result = await service.generateDm(dmOptions);

      expect(result).toContain('@author123');
      expect(result).toContain('Thanks for engaging');
    });

    it('should include context and custom instructions in prompt when provided', async () => {
      mockPromptBuilderService.buildPrompt.mockResolvedValue({ input: {} });
      mockReplicateService.generateTextCompletionSync.mockResolvedValue(
        'DM text',
      );

      await service.generateDm({
        ...dmOptions,
        context: 'I am a tech influencer',
        customInstructions: 'Mention my newsletter',
      });

      expect(mockPromptBuilderService.buildPrompt).toHaveBeenCalled();
    });
  });

  describe('replaceTemplateVariables', () => {
    it('should replace variables in a template string', () => {
      const template = 'Hello {name}, welcome to {platform}!';
      const variables = { name: 'Alice', platform: 'Genfeed' };

      const result = service.replaceTemplateVariables(template, variables);

      expect(result).toBe('Hello Alice, welcome to Genfeed!');
    });

    it('should handle multiple occurrences of the same variable', () => {
      const template = '{name} said hello to {name}';
      const variables = { name: 'Bob' };

      const result = service.replaceTemplateVariables(template, variables);

      expect(result).toBe('Bob said hello to Bob');
    });

    it('should return unchanged string when no variables match', () => {
      const template = 'No variables here';
      const variables = { unused: 'value' };

      const result = service.replaceTemplateVariables(template, variables);

      expect(result).toBe('No variables here');
    });

    it('should handle empty variables object', () => {
      const template = 'Hello {name}';

      const result = service.replaceTemplateVariables(template, {});

      expect(result).toBe('Hello {name}');
    });
  });
});
