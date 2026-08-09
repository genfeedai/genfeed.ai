import {
  collectionDocument,
  fetchResponse,
  installMockFetch,
} from '@services/__mocks__/http.mock';
import type { IContentOptimizationRequest } from '@services/ai/optimizers.service';
import { OptimizersService } from '@services/ai/optimizers.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const optimizationRequest: IContentOptimizationRequest = {
  content: 'Some content',
  platform: 'instagram',
  type: 'caption',
};

const contentScore = {
  breakdown: {
    brandConsistency: 80,
    engagement: 70,
    readability: 90,
    seo: 60,
    viralPotential: 50,
  },
  overall: 75,
  suggestions: [],
};

describe('OptimizersService', () => {
  const token = 'optimizer-token';
  let fetchMock: ReturnType<typeof installMockFetch>;

  beforeEach(() => {
    OptimizersService.clearInstance(token);
    fetchMock = installMockFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('caches instances per token and clears them', () => {
    const first = OptimizersService.getInstance(token);
    expect(OptimizersService.getInstance(token)).toBe(first);
    OptimizersService.clearInstance(token);
    expect(OptimizersService.getInstance(token)).not.toBe(first);
  });

  describe('analyzeContent', () => {
    it('POSTs the request to /optimizers/analyze', async () => {
      fetchMock.mockResolvedValue(fetchResponse(contentScore));

      const service = OptimizersService.getInstance(token);
      const result = await service.analyzeContent(optimizationRequest);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/optimizers/analyze');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(optimizationRequest);
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${token}`,
      );
      expect(result).toEqual(contentScore);
    });

    it('throws the endpoint-specific error on failure', async () => {
      fetchMock.mockResolvedValue(fetchResponse({}, { ok: false }));

      const service = OptimizersService.getInstance(token);
      await expect(service.analyzeContent(optimizationRequest)).rejects.toThrow(
        'Failed to analyze content',
      );
    });
  });

  describe('optimizeContent', () => {
    it('POSTs to /optimizers/optimize and returns the payload', async () => {
      const payload = {
        changes: ['tightened hook'],
        optimized: 'B',
        original: 'A',
        score: contentScore,
      };
      fetchMock.mockResolvedValue(fetchResponse(payload));

      const service = OptimizersService.getInstance(token);
      const result = await service.optimizeContent(optimizationRequest);

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain('/optimizers/optimize');
      expect(result).toEqual(payload);
    });
  });

  describe('optimizeHashtags', () => {
    it('POSTs content, platform, and count', async () => {
      const payload = {
        optimal: ['#one'],
        reasoning: [],
        score: 88,
        suggested: [],
        trending: [],
      };
      fetchMock.mockResolvedValue(fetchResponse(payload));

      const service = OptimizersService.getInstance(token);
      const result = await service.optimizeHashtags('text', 'tiktok', 5);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/optimizers/hashtags');
      expect(JSON.parse(init.body as string)).toEqual({
        content: 'text',
        count: 5,
        platform: 'tiktok',
      });
      expect(result).toEqual(payload);
    });
  });

  describe('getBestPostingTimes', () => {
    it('GETs with platform and timezone query params', async () => {
      const payload = { platform: 'instagram', recommendedTimes: [] };
      fetchMock.mockResolvedValue(fetchResponse(payload));

      const service = OptimizersService.getInstance(token);
      const result = await service.getBestPostingTimes('instagram', 'CET');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(
        '/optimizers/times?platform=instagram&timezone=CET',
      );
      expect(init.method).toBe('GET');
      expect(init.body).toBeUndefined();
      expect(result).toEqual(payload);
    });
  });

  describe('generateVariants', () => {
    it('POSTs content, count, and options', async () => {
      fetchMock.mockResolvedValue(fetchResponse([]));

      const service = OptimizersService.getInstance(token);
      const result = await service.generateVariants('text', 2, {
        varyTone: true,
      });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/optimizers/variants');
      expect(JSON.parse(init.body as string)).toEqual({
        content: 'text',
        count: 2,
        options: { varyTone: true },
      });
      expect(result).toEqual([]);
    });
  });

  describe('getOptimizationHistory', () => {
    it('builds the query string from provided params', async () => {
      fetchMock.mockResolvedValue(
        fetchResponse(collectionDocument([{ id: 'h1' }])),
      );

      const service = OptimizersService.getInstance(token);
      const result = await service.getOptimizationHistory({
        contentType: 'caption',
        limit: 3,
      });

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain('/optimizers/history?limit=3&contentType=caption');
      expect(result).toEqual([{ id: 'h1' }]);
    });

    it('omits the query string without params', async () => {
      fetchMock.mockResolvedValue(fetchResponse(collectionDocument([])));

      const service = OptimizersService.getInstance(token);
      await service.getOptimizationHistory();

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url.endsWith('/optimizers/history')).toBe(true);
    });
  });

  describe('calculateReadability', () => {
    it('scores simple text as easy to read', () => {
      const service = OptimizersService.getInstance(token);
      const result = service.calculateReadability('The cat sat. The dog ran.');

      expect(result.score).toBeGreaterThan(60);
      expect(result.metrics.wordCount).toBe(6);
      expect(result.metrics.sentenceCount).toBe(2);
      expect(result.suggestions).toEqual([]);
    });

    it('flags long complex sentences with suggestions', () => {
      const service = OptimizersService.getInstance(token);
      const longSentence = `${Array.from({ length: 25 })
        .map(() => 'incomprehensibility')
        .join(' ')}.`;
      const result = service.calculateReadability(longSentence);

      expect(result.metrics.avgWordsPerSentence).toBeGreaterThan(20);
      expect(result.suggestions).toContain(
        'Use shorter sentences for better readability',
      );
      expect(result.suggestions).toContain(
        'Simplify complex words where possible',
      );
      expect(result.suggestions).toContain(
        'Content may be too complex for general audiences',
      );
      expect(result.grade).toBe('Very Difficult');
    });

    it('treats short words as single syllable', () => {
      const service = OptimizersService.getInstance(token);
      const result = service.calculateReadability('a an it is');

      expect(result.metrics.avgSyllablesPerWord).toBe(1);
      expect(result.metrics.complexWords).toBe(0);
    });
  });
});
