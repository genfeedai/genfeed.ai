import { ArticleStatus } from '@genfeedai/contracts';
import { Article } from '@genfeedai/models/content/article.model';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { ArticlesService } from '@services/content/articles.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ArticlesService', () => {
  const articleId = 'article_1';
  let service: ArticlesService;
  let http: MockHttpInstance;

  function mockArticle(method: 'get' | 'patch' | 'post', id = articleId): void {
    http[method].mockResolvedValue(
      axiosResponse(resourceDocument({ title: 'Article' }, { id })),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ArticlesService('articles-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = ArticlesService.getInstance('tok');
    expect(ArticlesService.getInstance('tok')).toBe(first);
  });

  it('findBySlug GETs the slug route and maps an Article', async () => {
    mockArticle('get');

    const result = await service.findBySlug('my-post');

    expect(http.get).toHaveBeenCalledWith('slug/my-post');
    expect(result).toBeInstanceOf(Article);
  });

  it('findPublicArticles GETs the public collection', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: articleId, title: 'A' }])),
    );

    const result = await service.findPublicArticles({ limit: 3 });

    expect(http.get).toHaveBeenCalledWith('public', {
      params: { limit: 3 },
    });
    expect(result[0]).toBeInstanceOf(Article);
  });

  it('findPublicArticleBySlug GETs the public slug route', async () => {
    mockArticle('get');

    await service.findPublicArticleBySlug('my-post');

    expect(http.get).toHaveBeenCalledWith('public/slug/my-post');
  });

  describe('status transitions', () => {
    it('publish PATCHes status PUBLISHED with a publishedAt date', async () => {
      mockArticle('patch');

      await service.publish(articleId);

      expect(http.patch).toHaveBeenCalledWith(`/${articleId}`, {
        publishedAt: expect.any(Date),
        status: ArticleStatus.PUBLISHED,
      });
    });

    it('archive PATCHes status ARCHIVED', async () => {
      mockArticle('patch');

      await service.archive(articleId);

      expect(http.patch).toHaveBeenCalledWith(`/${articleId}`, {
        status: ArticleStatus.ARCHIVED,
      });
    });

    it('unarchive PATCHes status DRAFT', async () => {
      mockArticle('patch');

      await service.unarchive(articleId);

      expect(http.patch).toHaveBeenCalledWith(`/${articleId}`, {
        status: ArticleStatus.DRAFT,
      });
    });
  });

  it('generateArticles POSTs the generation request', async () => {
    http.post.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'gen_1', title: 'Gen' }])),
    );

    const result = await service.generateArticles({
      count: 2,
      prompt: 'Write about AI',
    });

    expect(http.post).toHaveBeenCalledWith('generations', {
      count: 2,
      prompt: 'Write about AI',
    });
    expect(result[0]).toBeInstanceOf(Article);
  });

  it('convertToThread POSTs the thread conversion', async () => {
    const payload = {
      totalTweets: 1,
      tweets: [{ characterCount: 5, content: 'Hello', order: 1 }],
    };
    http.post.mockResolvedValue(axiosResponse(payload));

    const result = await service.convertToThread(articleId);

    expect(http.post).toHaveBeenCalledWith(
      `${articleId}/thread-conversions`,
      {},
    );
    expect(result).toEqual(payload);
  });

  it('analyzeVirality POSTs the virality analysis', async () => {
    http.post.mockResolvedValue(axiosResponse({ score: 0.8 }));

    const result = await service.analyzeVirality(articleId);

    expect(http.post).toHaveBeenCalledWith(
      `/${articleId}/virality-analyses`,
      {},
    );
    expect(result).toEqual({ score: 0.8 });
  });

  it('scoreSeo POSTs the seo scoring request', async () => {
    mockArticle('post');

    await service.scoreSeo(articleId, { keywords: ['ai'] });

    expect(http.post).toHaveBeenCalledWith(`/${articleId}/seo-scores`, {
      keywords: ['ai'],
    });
  });

  it('review POSTs the review request with defaults', async () => {
    const rubric = {
      issues: [],
      revisionInstructions: '',
      score: 8,
      strengths: ['clear'],
      summary: 'good',
    };
    http.post.mockResolvedValue(axiosResponse(rubric));

    const result = await service.review(articleId);

    expect(http.post).toHaveBeenCalledWith(`/${articleId}/reviews`, {});
    expect(result).toEqual(rubric);
  });

  it('getVersions GETs the version history', async () => {
    const versions = { articleId, prompts: [], totalVersions: 0 };
    http.get.mockResolvedValue(axiosResponse(versions));

    const result = await service.getVersions(articleId);

    expect(http.get).toHaveBeenCalledWith(`/${articleId}/versions`);
    expect(result).toEqual(versions);
  });

  it('restoreVersion PATCHes the restore pointer', async () => {
    mockArticle('patch');

    await service.restoreVersion(articleId, 'prompt_2');

    expect(http.patch).toHaveBeenCalledWith(`/${articleId}`, {
      restoreFromVersionId: 'prompt_2',
    });
  });

  it('generatePrompt POSTs to the prompts route', async () => {
    http.post.mockResolvedValue(axiosResponse({ prompt: 'derived' }));

    const result = await service.generatePrompt(articleId);

    expect(http.post).toHaveBeenCalledWith(`/${articleId}/prompts`, {});
    expect(result).toEqual({ prompt: 'derived' });
  });

  it('generateImage POSTs image options with defaults', async () => {
    http.post.mockResolvedValue(axiosResponse({ id: 'img_1' }));

    await service.generateImage(articleId, { width: 1024 });
    await service.generateImage(articleId);

    expect(http.post).toHaveBeenNthCalledWith(1, `/${articleId}/images`, {
      width: 1024,
    });
    expect(http.post).toHaveBeenNthCalledWith(2, `/${articleId}/images`, {});
  });

  it('generateVideo POSTs video options with defaults', async () => {
    http.post.mockResolvedValue(axiosResponse({ id: 'vid_1' }));

    await service.generateVideo(articleId, { duration: 15 });
    await service.generateVideo(articleId);

    expect(http.post).toHaveBeenNthCalledWith(1, `/${articleId}/videos`, {
      duration: 15,
    });
    expect(http.post).toHaveBeenNthCalledWith(2, `/${articleId}/videos`, {});
  });
});
