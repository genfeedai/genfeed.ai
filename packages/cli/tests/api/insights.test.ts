import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockFlattenCollection = vi.fn();
const mockFlattenSingle = vi.fn();

vi.mock('../../src/api/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}));

vi.mock('../../src/api/json-api', () => ({
  flattenCollection: (...args: unknown[]) => mockFlattenCollection(...args),
  flattenSingle: (...args: unknown[]) => mockFlattenSingle(...args),
}));

describe('api/insights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists insights with the default limit', async () => {
    mockGet.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([{ id: 'insight-1' }]);

    const { getInsights } = await import('../../src/api/insights');
    const result = await getInsights();

    expect(mockGet).toHaveBeenCalledWith('/insights?limit=5');
    expect(result).toEqual([{ id: 'insight-1' }]);
  });

  it('lists insights with a custom limit', async () => {
    mockGet.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([]);

    const { getInsights } = await import('../../src/api/insights');
    await getInsights(20);

    expect(mockGet).toHaveBeenCalledWith('/insights?limit=20');
  });

  it('requests a forecast with topic and platform', async () => {
    mockPost.mockResolvedValue({ data: { id: 'forecast' } });
    mockFlattenSingle.mockReturnValue({ confidence: 0.8, topic: 'ai' });

    const { getForecast } = await import('../../src/api/insights');
    const result = await getForecast('ai', 'instagram');

    expect(mockPost).toHaveBeenCalledWith('/insights/forecast', {
      platform: 'instagram',
      topic: 'ai',
    });
    expect(result.topic).toBe('ai');
  });

  it('requests viral analysis for content', async () => {
    mockPost.mockResolvedValue({ data: { id: 'viral' } });
    mockFlattenSingle.mockReturnValue({ factors: ['hook'], score: 72 });

    const { getViralAnalysis } = await import('../../src/api/insights');
    const result = await getViralAnalysis('my post content');

    expect(mockPost).toHaveBeenCalledWith('/insights/viral', { content: 'my post content' });
    expect(result.score).toBe(72);
  });

  it('fetches content gaps', async () => {
    mockGet.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([{ topic: 'shorts' }]);

    const { getContentGaps } = await import('../../src/api/insights');
    const result = await getContentGaps();

    expect(mockGet).toHaveBeenCalledWith('/insights/gaps');
    expect(result).toEqual([{ topic: 'shorts' }]);
  });

  it('fetches posting times with defaults', async () => {
    mockGet.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([{ day: 'monday', hour: 9, score: 90 }]);

    const { getPostingTimes } = await import('../../src/api/insights');
    const result = await getPostingTimes();

    expect(mockGet).toHaveBeenCalledWith('/insights/times?platform=instagram&timezone=UTC');
    expect(result[0].hour).toBe(9);
  });

  it('fetches posting times for a custom platform and timezone', async () => {
    mockGet.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([]);

    const { getPostingTimes } = await import('../../src/api/insights');
    await getPostingTimes('linkedin', 'Europe/Amsterdam');

    expect(mockGet).toHaveBeenCalledWith(
      '/insights/times?platform=linkedin&timezone=Europe/Amsterdam'
    );
  });

  it('fetches growth prediction with the default platform', async () => {
    mockGet.mockResolvedValue({ data: { id: 'growth' } });
    mockFlattenSingle.mockReturnValue({ platform: 'instagram', predictedGrowth: 12 });

    const { getGrowthPrediction } = await import('../../src/api/insights');
    const result = await getGrowthPrediction();

    expect(mockGet).toHaveBeenCalledWith('/insights/growth?platform=instagram');
    expect(result.predictedGrowth).toBe(12);
  });
});
