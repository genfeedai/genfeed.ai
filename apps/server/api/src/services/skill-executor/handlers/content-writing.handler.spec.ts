import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { ContentWritingHandler } from '@api/services/skill-executor/handlers/content-writing.handler';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

describe('ContentWritingHandler', () => {
  let handler: ContentWritingHandler;

  const mockContentGeneratorService = {
    generateContent: vi.fn(),
  };

  const mockLlmDispatcherService = {
    chatCompletion: vi.fn(),
  };

  const mockLoggerService = {
    warn: vi.fn(),
  };

  const baseContext = {
    brandId: 'test-object-id',
    brandVoice: 'Bold and witty',
    organizationId: 'test-object-id',
    platforms: ['instagram'],
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentWritingHandler,
        {
          provide: ContentGeneratorService,
          useValue: mockContentGeneratorService,
        },
        { provide: LlmDispatcherService, useValue: mockLlmDispatcherService },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    handler = module.get(ContentWritingHandler);
  });

  it('generates content draft with refinement', async () => {
    mockContentGeneratorService.generateContent.mockResolvedValue([
      {
        content: 'Base generated content',
        hashtags: ['#ai'],
        patternUsed: 'freeform',
      },
    ]);

    mockLlmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: 'Refined content', role: 'assistant' },
        },
      ],
      id: '1',
      usage: { completion_tokens: 12, prompt_tokens: 24, total_tokens: 36 },
    });

    const result = await handler.execute(baseContext, {
      platform: 'instagram',
      topic: 'AI content workflows',
    });

    expect(result.content).toBe('Refined content');
    expect(result.skillSlug).toBe('content-writing');
    expect(result.type).toBe('text');
    expect(result.platforms).toEqual(['instagram']);
  });

  it('throws when topic is missing', async () => {
    await expect(handler.execute(baseContext, {})).rejects.toThrow(
      'content-writing requires a topic',
    );
  });

  it('falls back to base draft when LLM refinement fails', async () => {
    mockContentGeneratorService.generateContent.mockResolvedValue([
      {
        content: 'Base generated content',
        hashtags: ['#ai'],
        patternUsed: 'freeform',
      },
    ]);

    mockLlmDispatcherService.chatCompletion.mockRejectedValue(
      new Error('LLM provider unavailable'),
    );

    const result = await handler.execute(baseContext, {
      topic: 'AI workflows',
    });

    expect(result.content).toBe('Base generated content');
    expect(result.skillSlug).toBe('content-writing');
    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      'content-writing refinement failed, using base draft',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it('uses first platform from context when platform param is missing', async () => {
    mockContentGeneratorService.generateContent.mockResolvedValue([
      {
        content: 'Generated for twitter',
        hashtags: [],
        patternUsed: 'freeform',
      },
    ]);

    mockLlmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: 'Refined for twitter', role: 'assistant' },
        },
      ],
      id: '2',
      usage: { completion_tokens: 10, prompt_tokens: 20, total_tokens: 30 },
    });

    const result = await handler.execute(
      { ...baseContext, platforms: ['twitter'] },
      { topic: 'Thread about AI' },
    );

    expect(result.content).toBe('Refined for twitter');
    expect(mockContentGeneratorService.generateContent).toHaveBeenCalled();
  });
  it('asks the rewrite to fit X and lead with a hook', async () => {
    mockContentGeneratorService.generateContent.mockResolvedValue([
      { content: 'Base draft', hashtags: [], patternUsed: 'freeform' },
    ]);
    mockLlmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: 'Short rewrite', role: 'assistant' } }],
    });

    await handler.execute(baseContext, {
      platform: 'twitter',
      topic: 'AI hooks',
    });

    const [request] = mockLlmDispatcherService.chatCompletion.mock.calls[0];
    const systemPrompt = request.messages[0].content as string;
    expect(systemPrompt).toContain('Bold and witty');
    expect(systemPrompt).toContain('twitter post of 280 characters max');
    expect(systemPrompt).toContain('each link counts 23');
    expect(systemPrompt).toContain('strong hook in the first line');
  });

  it('keeps a base draft that fits X when the rewrite runs over', async () => {
    mockContentGeneratorService.generateContent.mockResolvedValue([
      { content: 'Fits on X', hashtags: [], patternUsed: 'freeform' },
    ]);
    mockLlmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: 'a'.repeat(281), role: 'assistant' } }],
    });

    const result = await handler.execute(baseContext, {
      platform: 'twitter',
      topic: 'AI hooks',
    });

    expect(result.content).toBe('Fits on X');
    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      'content-writing rewrite exceeded the platform limit, using base draft',
      { platform: 'twitter' },
    );
  });
});
