<<<<<<< HEAD
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { TrendRemixHandler } from '@api/services/skill-executor/handlers/trend-remix.handler';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

describe('TrendRemixHandler', () => {
  let handler: TrendRemixHandler;

  const mockTrendsService = {
    getTrendById: vi.fn(),
    getTrendsWithAccessControl: vi.fn(),
  };

  const mockLlmDispatcherService = {
    chatCompletion: vi.fn(),
  };

  const mockLoggerService = {
    warn: vi.fn(),
  };

  const baseContext = {
    brandId: 'brand-id',
    brandVoice: 'Bold and witty',
    organizationId: 'org-id',
    platforms: ['instagram'],
  };

  const mockTrend = {
    id: 'trend-id-1',
    metadata: { hashtags: ['#aitrend', '#viral'] },
    platform: 'instagram',
    topic: 'AI-generated art',
    viralityScore: 92,
  };

  const mockLlmSuccess = {
    choices: [
      {
        finish_reason: 'stop',
        message: {
          content: 'Remixed trend content here! #aitrend #viral',
          role: 'assistant',
        },
      },
    ],
    id: 'llm-1',
    usage: { completion_tokens: 20, prompt_tokens: 80, total_tokens: 100 },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendRemixHandler,
        { provide: TrendsService, useValue: mockTrendsService },
        { provide: LlmDispatcherService, useValue: mockLlmDispatcherService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    handler = module.get(TrendRemixHandler);
  });

  it('auto-selects first trend when no trendId is provided', async () => {
    mockTrendsService.getTrendsWithAccessControl.mockResolvedValue({
      connectedPlatforms: ['instagram'],
      lockedPlatforms: [],
      trends: [mockTrend],
    });

    mockLlmDispatcherService.chatCompletion.mockResolvedValue(mockLlmSuccess);

    const result = await handler.execute(baseContext, {});

    expect(mockTrendsService.getTrendsWithAccessControl).toHaveBeenCalledWith(
      baseContext.organizationId,
      baseContext.brandId,
      'instagram',
    );
    expect(mockTrendsService.getTrendById).not.toHaveBeenCalled();
    expect(result.skillSlug).toBe('trend-remix');
    expect(result.type).toBe('text');
    expect(result.content).toBe('Remixed trend content here! #aitrend #viral');
    expect(result.confidence).toBe(0.78);
    expect(result.metadata).toEqual({
      remixPackVariants: expect.any(Array),
      trendId: 'trend-id-1',
      trendTopic: 'AI-generated art',
    });
    expect(result.metadata.remixPackVariants).toEqual([
      expect.objectContaining({
        format: 'post-thread',
        hypothesis: expect.any(String),
        type: 'text',
      }),
      expect.objectContaining({
        format: 'social-image-creative',
        hypothesis: expect.any(String),
        type: 'image',
      }),
      expect.objectContaining({
        format: 'short-form-video-script',
        hypothesis: expect.any(String),
        type: 'video-script',
      }),
      expect.objectContaining({
        format: 'article-newsletter-angle',
        platform: 'newsletter',
        type: 'article',
      }),
      expect.objectContaining({
        format: 'follow-up-reply',
        hypothesis: expect.any(String),
        type: 'reply',
      }),
    ]);
  });

  it('uses explicit trendId when provided', async () => {
    mockTrendsService.getTrendById.mockResolvedValue(mockTrend);
    mockLlmDispatcherService.chatCompletion.mockResolvedValue(mockLlmSuccess);

    const result = await handler.execute(baseContext, {
      trendId: 'trend-id-1',
    });

    expect(mockTrendsService.getTrendById).toHaveBeenCalledWith(
      'trend-id-1',
      baseContext.organizationId,
    );
    expect(mockTrendsService.getTrendsWithAccessControl).not.toHaveBeenCalled();
    expect(result.metadata).toEqual(
      expect.objectContaining({ trendId: 'trend-id-1' }),
    );
  });

  it('returns low-confidence fallback when no trends exist', async () => {
    mockTrendsService.getTrendsWithAccessControl.mockResolvedValue({
=======
import { TrendRemixHandler } from '@api/services/skill-executor/handlers/trend-remix.handler';
import type { SkillExecutionContext } from '@api/services/skill-executor/interfaces/skill-executor.interfaces';
import { describe, expect, it, vi } from 'vitest';

const mockTrend = {
  _id: 'trend-1',
  metadata: { hashtags: ['#AI', '#agents'], sampleContent: 'test content' },
  platform: 'twitter',
  topic: 'AI agents',
  viralityScore: 85,
};

const mockTrendsResponse = {
  connectedPlatforms: ['twitter'],
  lockedPlatforms: [],
  trends: [mockTrend],
};

const mockContext: SkillExecutionContext = {
  brandId: 'brand-1',
  brandVoice: 'witty and insightful',
  memory: undefined,
  organizationId: 'org-1',
  platforms: ['twitter'],
};

function createMocks() {
  const trendsService = {
    getTrendsWithAccessControl: vi.fn().mockResolvedValue(mockTrendsResponse),
  };
  const llmDispatcherService = {
    chatCompletion: vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Remixed content about AI agents' } }],
    }),
  };
  const loggerService = { log: vi.fn(), warn: vi.fn() };

  const handler = new TrendRemixHandler(
    trendsService as never,
    llmDispatcherService as never,
    loggerService as never,
  );

  return { handler, llmDispatcherService, loggerService, trendsService };
}

describe('TrendRemixHandler', () => {
  it('should remix a trend with auto-selected top trend', async () => {
    const { handler, trendsService } = createMocks();

    const result = await handler.execute(mockContext, {});

    expect(trendsService.getTrendsWithAccessControl).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
    );
    expect(result.content).toBe('Remixed content about AI agents');
    expect(result.skillSlug).toBe('trend-remix');
    expect(result.type).toBe('text');
    expect(result.confidence).toBe(0.78);
    expect(result.metadata.trendId).toBe('trend-1');
  });

  it('should remix a specific trend by trendId', async () => {
    const { handler } = createMocks();

    const result = await handler.execute(mockContext, {
      trendId: 'trend-1',
    });

    expect(result.metadata.trendTopic).toBe('AI agents');
  });

  it('should throw when no active trends available', async () => {
    const { handler, trendsService } = createMocks();
    trendsService.getTrendsWithAccessControl.mockResolvedValue({
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
      connectedPlatforms: [],
      lockedPlatforms: [],
      trends: [],
    });

<<<<<<< HEAD
    const result = await handler.execute(baseContext, {});

    expect(result.content).toBe('No active trends found...');
    expect(result.confidence).toBe(0.3);
    expect(result.skillSlug).toBe('trend-remix');
    expect(result.type).toBe('text');
    expect(mockLlmDispatcherService.chatCompletion).not.toHaveBeenCalled();
  });

  it('falls back gracefully on LLM failure', async () => {
    mockTrendsService.getTrendsWithAccessControl.mockResolvedValue({
      connectedPlatforms: ['instagram'],
      lockedPlatforms: [],
      trends: [mockTrend],
    });

    mockLlmDispatcherService.chatCompletion.mockRejectedValue(
      new Error('LLM provider unavailable'),
    );

    const result = await handler.execute(baseContext, {});

    expect(result.confidence).toBe(0.4);
    expect(result.content).toContain('AI-generated art');
    expect(result.skillSlug).toBe('trend-remix');
    expect(result.type).toBe('text');
    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      'trend-remix LLM call failed, using fallback',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it('returns correct skillSlug and type on success', async () => {
    mockTrendsService.getTrendsWithAccessControl.mockResolvedValue({
      connectedPlatforms: ['instagram'],
      lockedPlatforms: [],
      trends: [mockTrend],
    });

    mockLlmDispatcherService.chatCompletion.mockResolvedValue(mockLlmSuccess);

    const result = await handler.execute(baseContext, {});

    expect(result.skillSlug).toBe('trend-remix');
    expect(result.type).toBe('text');
    expect(result.platforms).toEqual(baseContext.platforms);
  });

  it('uses explicit angle and hypothesis for remix pack variants', async () => {
    mockTrendsService.getTrendById.mockResolvedValue(mockTrend);
    mockLlmDispatcherService.chatCompletion.mockResolvedValue(mockLlmSuccess);

    const result = await handler.execute(baseContext, {
      angle: 'Founder workflow proof point',
      hypothesis: 'Concrete workflow examples outperform AI trend recaps',
      trendId: 'trend-id-1',
    });

    expect(result.metadata.remixPackVariants).toContainEqual(
      expect.objectContaining({
        angle: 'Founder workflow proof point',
        format: 'post-thread',
        hypothesis: 'Concrete workflow examples outperform AI trend recaps',
      }),
    );
=======
    await expect(handler.execute(mockContext, {})).rejects.toThrow(
      'No active trends available for remix',
    );
  });

  it('should fallback to stub draft when LLM fails', async () => {
    const { handler, llmDispatcherService, loggerService } = createMocks();
    llmDispatcherService.chatCompletion.mockRejectedValue(
      new Error('LLM unavailable'),
    );

    const result = await handler.execute(mockContext, {});

    expect(loggerService.warn).toHaveBeenCalled();
    expect(result.confidence).toBe(0.4);
    expect(result.content).toContain('AI agents');
    expect(result.metadata.fallback).toBe(true);
  });

  it('should return correct skillSlug and type', async () => {
    const { handler } = createMocks();

    const result = await handler.execute(mockContext, {
      platform: 'linkedin',
      tone: 'casual',
    });

    expect(result.skillSlug).toBe('trend-remix');
    expect(result.type).toBe('text');
    expect(result.metadata.platform).toBe('linkedin');
    expect(result.metadata.tone).toBe('casual');
>>>>>>> f3242288 (chore: recover WIP snapshot from 2026-05-02)
  });
});
