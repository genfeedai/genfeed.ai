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
