import { PersistedArticleStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateArticle, getArticle } from '@/api/articles';

const mockApiKey = vi.fn<[], string | undefined>();
const mockApiUrl = vi.fn<[], string>();
const mockFetch = vi.fn();

vi.mock('@/config/store', () => ({
  getApiKey: () => mockApiKey(),
  getApiUrl: () => mockApiUrl(),
}));

vi.mock('ofetch', () => ({
  ofetch: {
    create: () => mockFetch,
  },
}));

describe('api/articles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiUrl.mockReturnValue('https://api.genfeed.ai/v1');
    mockApiKey.mockReturnValue(undefined);
  });

  describe('generateArticle', () => {
    it('posts to /articles/generations with type standard and flattens the collection', async () => {
      mockFetch.mockResolvedValue({
        data: [
          {
            attributes: {
              category: 'post',
              label: 'AI in Healthcare',
              slug: 'ai-in-healthcare',
              status: PersistedArticleStatus.DRAFT,
              summary: 'How AI changes patient care',
            },
            id: 'art-1',
            type: 'article',
          },
          {
            attributes: {
              category: 'post',
              label: 'AI in Radiology',
              slug: 'ai-in-radiology',
              status: PersistedArticleStatus.DRAFT,
            },
            id: 'art-2',
            type: 'article',
          },
        ],
      });

      const result = await generateArticle({
        brandId: 'brand-1',
        count: 2,
        prompt: 'AI in healthcare',
        type: 'standard',
      });

      expect(mockFetch).toHaveBeenCalledWith('/articles/generations', {
        body: {
          brandId: 'brand-1',
          count: 2,
          prompt: 'AI in healthcare',
          type: 'standard',
        },
        method: 'POST',
      });
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('art-1');
      expect(result[0]?.label).toBe('AI in Healthcare');
      expect(result[1]?.slug).toBe('ai-in-radiology');

      const body = mockFetch.mock.calls[0][1].body as Record<string, unknown>;
      expect(body).toHaveProperty('brandId', 'brand-1');
      expect(body).not.toHaveProperty('brand');
    });

    it('passes optional category and keywords through', async () => {
      mockFetch.mockResolvedValue({ data: [] });

      await generateArticle({
        brandId: 'brand-1',
        category: 'guide',
        keywords: ['climate', 'renewable'],
        prompt: 'Climate solutions',
        type: 'standard',
      });

      expect(mockFetch).toHaveBeenCalledWith('/articles/generations', {
        body: {
          brandId: 'brand-1',
          category: 'guide',
          keywords: ['climate', 'renewable'],
          prompt: 'Climate solutions',
          type: 'standard',
        },
        method: 'POST',
      });
    });

    it('forwards cancellation to article generation', async () => {
      mockFetch.mockResolvedValue({ data: [] });
      const controller = new AbortController();
      const request = { brandId: 'brand-1', prompt: 'AI workflows', type: 'standard' } as const;

      await generateArticle(request, controller.signal);

      expect(mockFetch).toHaveBeenCalledWith('/articles/generations', {
        body: request,
        method: 'POST',
        signal: controller.signal,
      });
    });
  });

  describe('generateArticle with type x-article', () => {
    it('posts to /articles/generations with type x-article and flattens the single resource', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            category: 'x-article',
            label: 'Why agent evaluation is hard',
            status: PersistedArticleStatus.DRAFT,
            xArticleMetadata: {
              estimatedReadTime: 12,
              wordCount: 3120,
            },
          },
          id: 'art-x',
          type: 'article',
        },
      });

      const result = await generateArticle({
        brandId: 'brand-2',
        generateHeaderImage: true,
        prompt: 'Why agent evaluation is hard',
        targetWordCount: 3000,
        tone: 'analytical',
        type: 'x-article',
      });

      expect(mockFetch).toHaveBeenCalledWith('/articles/generations', {
        body: {
          brandId: 'brand-2',
          generateHeaderImage: true,
          prompt: 'Why agent evaluation is hard',
          targetWordCount: 3000,
          tone: 'analytical',
          type: 'x-article',
        },
        method: 'POST',
      });
      expect(result.id).toBe('art-x');
      expect(result.label).toBe('Why agent evaluation is hard');
      expect(result.xArticleMetadata?.wordCount).toBe(3120);

      const body = mockFetch.mock.calls[0][1].body as Record<string, unknown>;
      expect(body).toHaveProperty('brandId', 'brand-2');
      expect(body).not.toHaveProperty('brand');
    });

    it('propagates errors', async () => {
      mockFetch.mockRejectedValue(new Error('Insufficient credits'));

      await expect(
        generateArticle({ brandId: 'brand-1', prompt: 'anything', type: 'x-article' })
      ).rejects.toThrow('Insufficient credits');
    });
  });

  describe('getArticle', () => {
    it('flattens a single article', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            category: 'post',
            label: 'AI in Healthcare',
            slug: 'ai-in-healthcare',
            status: PersistedArticleStatus.PUBLISHED,
          },
          id: 'art-1',
          type: 'article',
        },
      });

      const result = await getArticle('art-1');

      expect(mockFetch).toHaveBeenCalledWith('/articles/art-1', { method: 'GET' });
      expect(result.id).toBe('art-1');
      expect(result.status).toBe(PersistedArticleStatus.PUBLISHED);
      expect(result.category).toBe('post');
    });

    it('propagates errors', async () => {
      mockFetch.mockRejectedValue(new Error('Not found'));

      await expect(getArticle('invalid')).rejects.toThrow('Not found');
    });
  });
});
