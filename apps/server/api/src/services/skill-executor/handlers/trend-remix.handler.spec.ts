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
      trendId: 'trend-id-1',
      trendTopic: 'AI-generated art',
    });
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
      connectedPlatforms: [],
      lockedPlatforms: [],
      trends: [],
    });

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
});
