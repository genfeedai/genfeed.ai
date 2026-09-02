import { MAX_PAGE_SIZE } from '@genfeedai/contracts/constants';
import { Article } from '@genfeedai/models/content/article.model';
import { Ingredient } from '@genfeedai/models/content/ingredient.model';
import { Post } from '@genfeedai/models/content/post.model';
import { Image } from '@genfeedai/models/ingredients/image.model';
import { Music } from '@genfeedai/models/ingredients/music.model';
import { Video } from '@genfeedai/models/ingredients/video.model';
import { Brand } from '@genfeedai/models/organization/brand.model';
import { Link } from '@genfeedai/models/social/link.model';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { PublicService } from '@services/external/public.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PublicService', () => {
  let service: PublicService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PublicService();
    http = installMockHttp(service);
  });

  it('getInstance returns a singleton', () => {
    const first = PublicService.getInstance();
    expect(PublicService.getInstance()).toBe(first);
  });

  describe('findPublicProfileBySlug', () => {
    it('GETs the brand by slug and maps to a Brand', async () => {
      http.get.mockResolvedValue(
        axiosResponse(resourceDocument({ slug: 'acme' }, { id: 'brand_1' })),
      );

      const result = await service.findPublicProfileBySlug('acme');

      expect(http.get).toHaveBeenCalledWith('brands/slug', {
        params: { slug: 'acme' },
      });
      expect(result).toBeInstanceOf(Brand);
      expect(result?.id).toBe('brand_1');
    });

    it('returns null when the document has no data', async () => {
      http.get.mockResolvedValue(axiosResponse({}));
      await expect(
        service.findPublicProfileBySlug('missing'),
      ).resolves.toBeNull();
    });
  });

  it('previewBrandOs POSTs bounded intake and unwraps the handoff', async () => {
    const preview = {
      draft: { brandId: 'preview-1', id: 'preview-1', status: 'partial' },
      expiresAt: '2026-08-26T12:30:00.000Z',
      previewToken: 'a'.repeat(43),
    };
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument(preview, { id: 'preview-1' })),
    );

    const result = await service.previewBrandOs({
      guidance: 'Direct, proof-led guidance.',
    });

    expect(http.post).toHaveBeenCalledWith('brand-os/preview', {
      guidance: 'Direct, proof-led guidance.',
    });
    expect(result).toMatchObject(preview);
  });

  it('creates, polls, and previews a public YouTube clip session by opaque token', async () => {
    const session = {
      expiresAt: '2026-08-26T12:30:00.000Z',
      id: 'session-1',
      preview: { status: 'available' },
      previewToken: 'a'.repeat(43),
      progress: 0,
      recommendations: [],
      status: 'queued',
      transcript: [],
    };
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument(session, { id: session.id })),
    );
    http.get.mockResolvedValue(
      axiosResponse(resourceDocument(session, { id: session.id })),
    );

    await expect(
      service.createPublicYoutubeClip(
        'https://www.youtube.com/watch?v=abc12345',
        'request-key-1',
      ),
    ).resolves.toMatchObject(session);
    expect(http.post).toHaveBeenCalledWith(
      'youtube-clips',
      { youtubeUrl: 'https://www.youtube.com/watch?v=abc12345' },
      { headers: { 'Idempotency-Key': 'request-key-1' } },
    );

    await service.getPublicYoutubeClip(session.previewToken);
    expect(http.get).toHaveBeenCalledWith(
      `youtube-clips/${session.previewToken}`,
    );

    await service.requestPublicYoutubeClipPreview(
      session.previewToken,
      'recommendation-1',
    );
    expect(http.post).toHaveBeenLastCalledWith(
      `youtube-clips/${session.previewToken}/preview`,
      { recommendationId: 'recommendation-1' },
    );
  });

  it('findPublicAccountLinks maps links for the brand', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'link_1', url: 'https://x' }])),
    );

    const result = await service.findPublicAccountLinks('brand_1');

    expect(http.get).toHaveBeenCalledWith('brands/brand_1/links', {
      params: undefined,
    });
    expect(result[0]).toBeInstanceOf(Link);
  });

  it('trackAccountView POSTs a view event', async () => {
    http.post.mockResolvedValue(axiosResponse(undefined));

    await service.trackAccountView('brand_1');

    expect(http.post).toHaveBeenCalledWith('brands/brand_1/views');
  });

  describe('public collections', () => {
    const collectionCases = [
      ['findPublicBrands', 'brands', Brand],
      ['findPublicVideos', 'videos', Video],
      ['findPublicImages', 'images', Image],
      ['findPublicMusics', 'musics', Music],
      ['findPublicPosts', 'posts', Post],
      ['findPublicArticles', 'articles', Article],
      ['findPublicIngredients', 'posts/ingredients', Ingredient],
    ] as const;

    it.each(collectionCases)(
      '%s GETs %s and maps models',
      async (method, path, Model) => {
        http.get.mockResolvedValue(
          axiosResponse(collectionDocument([{ id: 'x_1', label: 'Item' }])),
        );

        const result = await service[method]({ limit: 2 });

        expect(http.get).toHaveBeenCalledWith(path, {
          params: { limit: 2 },
        });
        expect(result[0]).toBeInstanceOf(Model);
      },
    );

    describe('findAllPublicArticles', () => {
      it('never asks for more than the API accepts', async () => {
        http.get.mockResolvedValue(axiosResponse(collectionDocument([])));

        await service.findAllPublicArticles({ sortBy: 'publishedAt' });

        for (const call of http.get.mock.calls) {
          expect(call[1]?.params?.limit).toBeLessThanOrEqual(MAX_PAGE_SIZE);
        }
      });

      it('walks pages until a short page ends the corpus', async () => {
        const fullPage = Array.from({ length: MAX_PAGE_SIZE }, (_, index) => ({
          id: `article_${index}`,
        }));

        http.get
          .mockResolvedValueOnce(axiosResponse(collectionDocument(fullPage)))
          .mockResolvedValueOnce(
            axiosResponse(collectionDocument([{ id: 'article_last' }])),
          );

        const result = await service.findAllPublicArticles();

        expect(http.get).toHaveBeenCalledTimes(2);
        expect(http.get).toHaveBeenNthCalledWith(1, 'articles', {
          params: { limit: MAX_PAGE_SIZE, page: 1 },
        });
        expect(http.get).toHaveBeenNthCalledWith(2, 'articles', {
          params: { limit: MAX_PAGE_SIZE, page: 2 },
        });
        expect(result).toHaveLength(MAX_PAGE_SIZE + 1);
      });

      it('stops after one request when the first page is short', async () => {
        http.get.mockResolvedValue(
          axiosResponse(collectionDocument([{ id: 'article_1' }])),
        );

        await expect(service.findAllPublicArticles()).resolves.toHaveLength(1);
        expect(http.get).toHaveBeenCalledTimes(1);
      });
    });

    it('collections resolve to [] when the request fails', async () => {
      http.get.mockRejectedValue(new Error('network'));
      await expect(service.findPublicBrands()).resolves.toEqual([]);
    });

    it('findPublicPostsWithSignal forwards the abort signal and does not swallow errors', async () => {
      const controller = new AbortController();
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'post_1', label: 'P' }])),
      );

      const result = await service.findPublicPostsWithSignal(
        { limit: 1 },
        controller.signal,
      );

      expect(http.get).toHaveBeenCalledWith('posts', {
        params: { limit: 1 },
        signal: controller.signal,
      });
      expect(result[0]).toBeInstanceOf(Post);

      http.get.mockRejectedValue(new Error('aborted'));
      await expect(service.findPublicPostsWithSignal()).rejects.toThrow(
        'aborted',
      );
    });
  });

  describe('public single resources', () => {
    const resourceCases = [
      ['getPublicVideo', 'videos/v_1', Video],
      ['getPublicImage', 'images/v_1', Image],
      ['getPublicMusic', 'musics/v_1', Music],
      ['getPublicArticle', 'articles/v_1', Article],
      ['getPublicIngredient', 'posts/ingredients/v_1', Ingredient],
      ['getPublicPost', 'posts/v_1', Post],
    ] as const;

    it.each(resourceCases)('%s GETs %s', async (method, path, Model) => {
      http.get.mockResolvedValue(
        axiosResponse(resourceDocument({ label: 'Item' }, { id: 'v_1' })),
      );

      const result = await service[method]('v_1');

      expect(http.get).toHaveBeenCalledWith(path);
      expect(result).toBeInstanceOf(Model);
    });

    it('single resources resolve to null on missing data', async () => {
      http.get.mockResolvedValue(axiosResponse({}));
      await expect(service.getPublicVideo('missing')).resolves.toBeNull();
    });

    it('single resources resolve to null on request failure', async () => {
      http.get.mockRejectedValue(new Error('network'));
      await expect(service.getPublicPost('boom')).resolves.toBeNull();
    });
  });

  describe('getPublicArticleBySlug', () => {
    it('passes the preview token when provided', async () => {
      http.get.mockResolvedValue(
        axiosResponse(resourceDocument({ slug: 'post' }, { id: 'article_1' })),
      );

      const result = await service.getPublicArticleBySlug('post', 'tok_123');

      expect(http.get).toHaveBeenCalledWith('articles/slug/post', {
        params: { previewToken: 'tok_123' },
      });
      expect(result).toBeInstanceOf(Article);
    });

    it('omits the preview token by default and nulls on failure', async () => {
      http.get.mockResolvedValue(axiosResponse({}));
      await expect(service.getPublicArticleBySlug('post')).resolves.toBeNull();
      expect(http.get).toHaveBeenCalledWith('articles/slug/post', {
        params: {},
      });

      http.get.mockRejectedValue(new Error('network'));
      await expect(service.getPublicArticleBySlug('post')).resolves.toBeNull();
    });
  });
});
