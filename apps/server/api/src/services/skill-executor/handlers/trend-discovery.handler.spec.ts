import { TrendsService } from '@api/collections/trends/services/trends.service';
import { TrendDiscoveryHandler } from '@api/services/skill-executor/handlers/trend-discovery.handler';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

describe('TrendDiscoveryHandler', () => {
  let handler: TrendDiscoveryHandler;

  const mockTrendsService = {
    getTrendsWithAccessControl: vi.fn(),
  };

  const baseContext = {
    brandId: new Types.ObjectId().toString(),
    brandVoice: 'Witty and informative',
    organizationId: new Types.ObjectId().toString(),
    platforms: ['instagram'],
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendDiscoveryHandler,
        { provide: TrendsService, useValue: mockTrendsService },
      ],
    }).compile();

    handler = module.get(TrendDiscoveryHandler);
  });

  it('returns trend remix suggestions as content draft', async () => {
    mockTrendsService.getTrendsWithAccessControl.mockResolvedValue({
      connectedPlatforms: ['instagram'],
      lockedPlatforms: [],
      trends: [
        {
          growthRate: 90,
          metadata: { hashtags: ['#ai'] },
          platform: 'instagram',
          topic: 'AI reels',
          viralityScore: 88,
        },
      ],
    });

    const result = await handler.execute(baseContext, {});

    expect(result.skillSlug).toBe('trend-discovery');
    expect(result.content).toContain('AI reels');
    expect(result.type).toBe('trend-report');
    expect(result.metadata).toEqual(
      expect.objectContaining({
        connectedPlatforms: ['instagram'],
        trendCount: 1,
      }),
    );
  });

  it('returns fallback message when no trends match', async () => {
    mockTrendsService.getTrendsWithAccessControl.mockResolvedValue({
      connectedPlatforms: ['instagram'],
      lockedPlatforms: [],
      trends: [],
    });

    const result = await handler.execute(baseContext, {});

    expect(result.content).toBe(
      'No active trends matched this brand right now.',
    );
    expect(result.metadata).toEqual(expect.objectContaining({ trendCount: 0 }));
  });

  it('propagates trends service error', async () => {
    mockTrendsService.getTrendsWithAccessControl.mockRejectedValue(
      new Error('Twitter API rate limited'),
    );

    await expect(handler.execute(baseContext, {})).rejects.toThrow(
      'Twitter API rate limited',
    );
  });

  it('limits trends to top 5', async () => {
    const trends = Array.from({ length: 10 }, (_, i) => ({
      growthRate: 90 - i,
      metadata: { hashtags: [`#trend${i}`] },
      platform: 'instagram',
      topic: `Trend ${i}`,
      viralityScore: 100 - i,
    }));

    mockTrendsService.getTrendsWithAccessControl.mockResolvedValue({
      connectedPlatforms: ['instagram'],
      lockedPlatforms: [],
      trends,
    });

    const result = await handler.execute(baseContext, {});

    const lines = result.content.split('\n').filter(Boolean);
    expect(lines).toHaveLength(5);
    expect(result.content).toContain('Trend 0');
    expect(result.content).toContain('Trend 4');
    expect(result.content).not.toContain('Trend 5');
  });

  it('passes platform filter to trends service', async () => {
    mockTrendsService.getTrendsWithAccessControl.mockResolvedValue({
      connectedPlatforms: ['twitter'],
      lockedPlatforms: [],
      trends: [],
    });

    await handler.execute(baseContext, { platform: 'twitter' });

    expect(mockTrendsService.getTrendsWithAccessControl).toHaveBeenCalledWith(
      baseContext.organizationId,
      baseContext.brandId,
      'twitter',
    );
  });
});
