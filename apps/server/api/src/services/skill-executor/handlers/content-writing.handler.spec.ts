import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { ContentWritingHandler } from '@api/services/skill-executor/handlers/content-writing.handler';
import { SkillBrandBriefService } from '@api/services/skill-executor/skill-brand-brief.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

describe('ContentWritingHandler', () => {
  let handler: ContentWritingHandler;

  const mockContentGeneratorService = {
    generateContentWorkflow: vi.fn(),
  };

  const mockLlmDispatcherService = {
    chatCompletion: vi.fn(),
  };

  const mockLoggerService = {
    warn: vi.fn(),
  };

  const mockSkillBrandBriefService = {
    resolve: vi.fn(),
  };

  const baseContext = {
    brandId: 'test-object-id',
    brandVoice: 'Bold and witty',
    organizationId: 'test-object-id',
    platforms: ['instagram'],
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSkillBrandBriefService.resolve.mockResolvedValue(
      'Brand brief: bold and witty. Guardrails: no hype claims.',
    );

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
        {
          provide: SkillBrandBriefService,
          useValue: mockSkillBrandBriefService,
        },
      ],
    }).compile();

    handler = module.get(ContentWritingHandler);
  });

  it('generates content draft with refinement', async () => {
    mockContentGeneratorService.generateContentWorkflow.mockResolvedValue([
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

  it('writes the draft and the rewrite against the harness brief', async () => {
    mockContentGeneratorService.generateContentWorkflow.mockResolvedValue([
      { content: 'Base draft', hashtags: [], patternUsed: 'freeform' },
    ]);
    mockLlmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: 'Rewrite', role: 'assistant' } }],
    });

    await handler.execute(
      { ...baseContext, userId: 'user-1' },
      { platform: 'twitter', topic: 'AI hooks' },
    );

    expect(mockSkillBrandBriefService.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'test-object-id', userId: 'user-1' }),
      { contentType: 'post', platform: 'twitter', topic: 'AI hooks' },
    );
    expect(
      mockContentGeneratorService.generateContentWorkflow,
    ).toHaveBeenCalledWith(
      'user-1',
      'test-object-id',
      expect.objectContaining({ brandId: 'test-object-id', topic: 'AI hooks' }),
      true,
    );
  });

  it('refuses before any generation when the brand brief is unavailable', async () => {
    mockSkillBrandBriefService.resolve.mockRejectedValue(
      new ServiceUnavailableException('Brand context could not be loaded'),
    );

    await expect(
      handler.execute(baseContext, { topic: 'AI hooks' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(
      mockContentGeneratorService.generateContentWorkflow,
    ).not.toHaveBeenCalled();
    expect(mockLlmDispatcherService.chatCompletion).not.toHaveBeenCalled();
  });

  it('throws when topic is missing', async () => {
    await expect(handler.execute(baseContext, {})).rejects.toThrow(
      'content-writing requires a topic',
    );
  });

  it('falls back to base draft when LLM refinement fails', async () => {
    mockContentGeneratorService.generateContentWorkflow.mockResolvedValue([
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
    mockContentGeneratorService.generateContentWorkflow.mockResolvedValue([
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
    expect(
      mockContentGeneratorService.generateContentWorkflow,
    ).toHaveBeenCalled();
  });
  it('asks the rewrite to fit X and lead with a hook', async () => {
    mockContentGeneratorService.generateContentWorkflow.mockResolvedValue([
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
    expect(systemPrompt).toContain('Guardrails: no hype claims.');
    expect(systemPrompt).toContain('twitter post of 280 characters max');
    expect(systemPrompt).toContain('each link counts 23');
    expect(systemPrompt).toContain('strong hook in the first line');
  });

  it('keeps a base draft that fits X when the rewrite runs over', async () => {
    mockContentGeneratorService.generateContentWorkflow.mockResolvedValue([
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
