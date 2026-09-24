import { TrendsService } from '@api/collections/trends/services/trends.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { TrendRemixHandler } from '@api/services/skill-executor/handlers/trend-remix.handler';
import { LoggerService } from '@libs/logger/logger.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    vi.resetAllMocks();

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

  it('rejects missing trends before any billable provider call', async () => {
    mockTrendsService.getTrendsWithAccessControl.mockResolvedValue({
      connectedPlatforms: [],
      lockedPlatforms: [],
      trends: [],
    });

    await expect(handler.execute(baseContext, {})).rejects.toThrow(
      new NotFoundException({
        message:
          'No eligible trend source is available. Choose an existing source and retry.',
      }),
    );
    expect(mockLlmDispatcherService.chatCompletion).not.toHaveBeenCalled();
  });

  it.each([null, { ...mockTrend, organizationId: 'other-org' }])(
    'rejects unavailable explicit trend %j before any provider call',
    async (trend) => {
      mockTrendsService.getTrendById.mockResolvedValue(trend);
      await expect(
        handler.execute(baseContext, { trendId: 'trend-id-1' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockLlmDispatcherService.chatCompletion).not.toHaveBeenCalled();
    },
  );

  it('logs provider failures and rejects with a retryable error', async () => {
    mockTrendsService.getTrendById.mockResolvedValue(mockTrend);
    const error = new Error('LLM provider unavailable');
    mockLlmDispatcherService.chatCompletion.mockRejectedValue(error);

    await expect(
      handler.execute(baseContext, { trendId: 'trend-id-1' }),
    ).rejects.toThrow(
      new ServiceUnavailableException(
        'Trend remix generation failed. Retry the request.',
      ),
    );
    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      'trend-remix LLM call failed',
      { error },
    );
  });

  it.each(['', null, undefined, '  \n\t '])(
    'rejects empty provider output %j instead of returning a draft',
    async (content) => {
      mockTrendsService.getTrendById.mockResolvedValue(mockTrend);
      mockLlmDispatcherService.chatCompletion.mockResolvedValue({
        choices: [{ message: { content } }],
      });
      await expect(
        handler.execute(baseContext, { trendId: 'trend-id-1' }),
      ).rejects.toThrow(
        new ServiceUnavailableException(
          'Trend remix generation failed. Retry the request.',
        ),
      );
    },
  );

  it('rejects a provider response without choices', async () => {
    mockTrendsService.getTrendById.mockResolvedValue(mockTrend);
    mockLlmDispatcherService.chatCompletion.mockResolvedValue({ choices: [] });
    await expect(
      handler.execute(baseContext, { trendId: 'trend-id-1' }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('preserves real generated content after trimming surrounding whitespace', async () => {
    mockTrendsService.getTrendById.mockResolvedValue(mockTrend);
    mockLlmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [
        { message: { content: '  Real content\nwith a line break.  ' } },
      ],
    });
    const result = await handler.execute(baseContext, {
      trendId: 'trend-id-1',
    });
    expect(result.content).toBe('Real content\nwith a line break.');
    expect(result.metadata.remixPackVariants).toContainEqual(
      expect.objectContaining({
        content: result.content,
        format: 'post-thread',
      }),
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
  });
});
