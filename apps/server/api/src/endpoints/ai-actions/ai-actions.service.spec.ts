import { AiActionsService } from '@api/endpoints/ai-actions/ai-actions.service';
import {
  AiActionType,
  type ExecuteAiActionDto,
} from '@api/endpoints/ai-actions/dto/ai-action.dto';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { ByokService } from '@api/services/byok/byok.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { ByokProvider } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('AiActionsService', () => {
  let service: AiActionsService;
  let contextAssemblyService: vi.Mocked<AgentContextAssemblyService>;
  let openRouterService: vi.Mocked<OpenRouterService>;
  let byokService: vi.Mocked<ByokService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiActionsService,
        {
          provide: AgentContextAssemblyService,
          useValue: {
            assembleContext: vi.fn().mockResolvedValue(null),
            buildSystemPrompt: vi.fn().mockReturnValue(''),
          },
        },
        {
          provide: OpenRouterService,
          useValue: {
            chatCompletion: vi.fn(),
          },
        },
        {
          provide: ByokService,
          useValue: {
            resolveApiKey: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AiActionsService>(AiActionsService);
    contextAssemblyService = module.get(AgentContextAssemblyService);
    openRouterService = module.get(OpenRouterService);
    byokService = module.get(ByokService);
    loggerService = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute', () => {
    it('should throw BadRequestException for unknown action', async () => {
      const dto: ExecuteAiActionDto = {
        action: 'unknown_action' as never,
        content: 'test content',
      };

      await expect(service.execute('org_123', dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.execute('org_123', dto)).rejects.toThrow(
        'Unknown action type: unknown_action',
      );
    });

    it('assembles brand context with brandMemory + performancePatterns + recentPosts enabled (#3019)', async () => {
      const dto: ExecuteAiActionDto = {
        action: AiActionType.REWRITE,
        content: 'Test content',
      };

      byokService.resolveApiKey.mockResolvedValue(undefined);
      openRouterService.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'Result' } }],
        usage: { total_tokens: 50 },
      } as never);

      await service.execute('org_123', dto);

      expect(contextAssemblyService.assembleContext).toHaveBeenCalledWith({
        layers: {
          brandGuidance: true,
          brandIdentity: true,
          brandMemory: true,
          performancePatterns: true,
          ragContext: true,
          recentPosts: true,
        },
        organizationId: 'org_123',
        query: 'Test content',
      });
    });

    it('should execute action without BYOK successfully', async () => {
      const dto: ExecuteAiActionDto = {
        action: AiActionType.REWRITE,
        content: 'Image description',
        context: { brand: 'TestBrand', tone: 'professional' },
      };

      byokService.resolveApiKey.mockResolvedValue(undefined);
      openRouterService.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'Generated caption' } }],
        usage: { total_tokens: 100 },
      } as never);

      const result = await service.execute('org_123', dto);

      expect(byokService.resolveApiKey).toHaveBeenCalledWith(
        'org_123',
        ByokProvider.OPENROUTER,
      );
      expect(openRouterService.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 2000,
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ content: dto.content, role: 'user' }),
          ]),
          temperature: 0.7,
        }),
        undefined,
      );
      expect(result).toEqual({
        isByok: false,
        result: 'Generated caption',
        tokensUsed: 100,
      });
    });

    it('should execute action with BYOK API key', async () => {
      const dto: ExecuteAiActionDto = {
        action: AiActionType.HOOK_GENERATOR,
        content: 'Original hook',
      };

      byokService.resolveApiKey.mockResolvedValue({
        apiKey: 'sk-custom-key',
      } as never);
      openRouterService.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'Improved hook text' } }],
        usage: { total_tokens: 150 },
      } as never);

      const result = await service.execute('org_456', dto);

      expect(openRouterService.chatCompletion).toHaveBeenCalledWith(
        expect.anything(),
        'sk-custom-key',
      );
      expect(result).toEqual({
        isByok: true,
        result: 'Improved hook text',
        tokensUsed: 150,
      });
    });

    it('should handle context variable replacement', async () => {
      const dto: ExecuteAiActionDto = {
        action: AiActionType.REWRITE,
        content: 'Test content',
        context: {
          brand: 'MyBrand',
          tone: 'casual',
        },
      };

      byokService.resolveApiKey.mockResolvedValue(undefined);
      openRouterService.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'Result' } }],
        usage: { total_tokens: 50 },
      } as never);

      await service.execute('org_123', dto);

      const callArgs = openRouterService.chatCompletion.mock.calls[0][0];
      const systemMessage = callArgs.messages.find(
        (m: { role: string }) => m.role === 'system',
      );
      expect(systemMessage).toBeDefined();
    });

    it('should trim whitespace from result', async () => {
      const dto: ExecuteAiActionDto = {
        action: AiActionType.REWRITE,
        content: 'Test',
      };

      byokService.resolveApiKey.mockResolvedValue(undefined);
      openRouterService.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: '  Trimmed result  \n' } }],
        usage: { total_tokens: 75 },
      } as never);

      const result = await service.execute('org_123', dto);

      expect(result.result).toBe('Trimmed result');
    });

    it('includes cinematography lexicon guidance for enhance-prompt', async () => {
      const dto: ExecuteAiActionDto = {
        action: AiActionType.ENHANCE_PROMPT,
        content: 'shot from above, moody',
        context: { category: 'MODELS_PROMPT_IMAGE' },
      };

      byokService.resolveApiKey.mockResolvedValue(undefined);
      openRouterService.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'high-angle shot, low-key' } }],
        usage: { total_tokens: 40 },
      } as never);

      await service.execute('org_123', dto);

      const callArgs = openRouterService.chatCompletion.mock.calls[0][0];
      const systemMessage = callArgs.messages.find(
        (message: { role: string }) => message.role === 'system',
      );
      expect(systemMessage?.content).toContain('Cinematography vocabulary');
      expect(systemMessage?.content).toContain('high-angle shot');
    });

    it('omits cinematography lexicon guidance for text-only enhance-prompt categories', async () => {
      const dto: ExecuteAiActionDto = {
        action: AiActionType.ENHANCE_PROMPT,
        content: 'rewrite this caption',
        context: { category: 'ARTICLE' },
      };

      byokService.resolveApiKey.mockResolvedValue(undefined);
      openRouterService.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'rewritten caption' } }],
        usage: { total_tokens: 20 },
      } as never);

      await service.execute('org_123', dto);

      const callArgs = openRouterService.chatCompletion.mock.calls[0][0];
      const systemMessage = callArgs.messages.find(
        (message: { role: string }) => message.role === 'system',
      );
      expect(systemMessage?.content).not.toContain('Cinematography vocabulary');
    });

    it('should handle empty response content', async () => {
      const dto: ExecuteAiActionDto = {
        action: AiActionType.REWRITE,
        content: 'Test',
      };

      byokService.resolveApiKey.mockResolvedValue(undefined);
      openRouterService.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: null } }],
        usage: { total_tokens: 10 },
      } as never);

      const result = await service.execute('org_123', dto);

      expect(result.result).toBe('');
    });

    it('should log and rethrow errors from OpenRouter', async () => {
      const dto: ExecuteAiActionDto = {
        action: AiActionType.REWRITE,
        content: 'Test',
      };

      const error = {
        message: 'API rate limit exceeded',
        response: {
          status: 429,
          statusText: 'Too Many Requests',
        },
      };

      byokService.resolveApiKey.mockResolvedValue(undefined);
      openRouterService.chatCompletion.mockRejectedValue(error);

      await expect(service.execute('org_789', dto)).rejects.toThrow();

      expect(loggerService.error).toHaveBeenCalledWith(
        'AiActionsService.execute failed for org=org_789 action=rewrite',
        {
          message: 'API rate limit exceeded',
          status: 429,
          statusText: 'Too Many Requests',
        },
      );
    });

    it('should handle non-standard errors', async () => {
      const dto: ExecuteAiActionDto = {
        action: AiActionType.REWRITE,
        content: 'Test',
      };

      byokService.resolveApiKey.mockResolvedValue(undefined);
      openRouterService.chatCompletion.mockRejectedValue('string error');

      await expect(service.execute('org_999', dto)).rejects.toBe(
        'string error',
      );

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('AiActionsService.execute failed'),
        expect.objectContaining({
          message: 'Unknown error',
        }),
      );
    });
  });
});
