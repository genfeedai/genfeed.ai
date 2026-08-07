import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateArticles, generateXArticle, getArticle } from '../../src/api/articles';

const mockApiKey = vi.fn<[], string | undefined>();
const mockApiUrl = vi.fn<[], string>();
const mockFetch = vi.fn();

vi.mock('../../src/config/store', () => ({
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

  describe('generateArticles', () => {
    it('posts to /articles/generations with type standard and flattens the collection', async () => {
      mockFetch.mockResolvedValue({
        data: [
          {
            attributes: {
              category: 'post',
              label: 'AI in Healthcare',
              slug: 'ai-in-healthcare',
              status: 'draft',
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
              status: 'draft',
            },
            id: 'art-2',
            type: 'article',
          },
        ],
      });

      const result = await generateArticles({ count: 2, prompt: 'AI in healthcare' });

      expect(mockFetch).toHaveBeenCalledWith('/articles/generations', {
        body: {
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
    });

    it('passes optional category and keywords through', async () => {
      mockFetch.mockResolvedValue({ data: [] });

      await generateArticles({
        category: 'guide',
        keywords: ['climate', 'renewable'],
        prompt: 'Climate solutions',
      });

      expect(mockFetch).toHaveBeenCalledWith('/articles/generations', {
        body: {
          category: 'guide',
          keywords: ['climate', 'renewable'],
          prompt: 'Climate solutions',
          type: 'standard',
        },
        method: 'POST',
      });
    });
  });

  describe('generateXArticle', () => {
    it('posts to /articles/generations with type x-article and flattens the single resource', async () => {
      mockFetch.mockResolvedValue({
        data: {
          attributes: {
            category: 'x-article',
            label: 'Why agent evaluation is hard',
            status: 'draft',
            xArticleMetadata: {
              estimatedReadTime: 12,
              wordCount: 3120,
            },
          },
          id: 'art-x',
          type: 'article',
        },
      });

      const result = await generateXArticle({
        generateHeaderImage: true,
        prompt: 'Why agent evaluation is hard',
        targetWordCount: 3000,
        tone: 'analytical',
      });

      expect(mockFetch).toHaveBeenCalledWith('/articles/generations', {
        body: {
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
    });

    it('propagates errors', async () => {
      mockFetch.mockRejectedValue(new Error('Insufficient credits'));

      await expect(generateXArticle({ prompt: 'anything' })).rejects.toThrow(
        'Insufficient credits'
      );
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
            status: 'public',
          },
          id: 'art-1',
          type: 'article',
        },
      });

      const result = await getArticle('art-1');

      expect(mockFetch).toHaveBeenCalledWith('/articles/art-1', { method: 'GET' });
      expect(result.id).toBe('art-1');
      expect(result.status).toBe('public');
      expect(result.category).toBe('post');
    });

    it('propagates errors', async () => {
      mockFetch.mockRejectedValue(new Error('Not found'));

      await expect(getArticle('invalid')).rejects.toThrow('Not found');
    });
  });
});
