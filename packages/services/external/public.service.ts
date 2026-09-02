import { MAX_PAGE_SIZE } from '@genfeedai/contracts/constants';
import type {
  IBrandOsPreview,
  IBrandOsPreviewRequest,
  IPublicYoutubeClipToolSession,
  IPublicYoutubeLongFormToolResult,
  IQueryParams,
  PublicYoutubeLongFormOutputType,
} from '@genfeedai/contracts/interfaces';
import { Article } from '@genfeedai/models/content/article.model';
import { Ingredient } from '@genfeedai/models/content/ingredient.model';
import { Post } from '@genfeedai/models/content/post.model';
import { Image } from '@genfeedai/models/ingredients/image.model';
import { Music } from '@genfeedai/models/ingredients/music.model';
import { Video } from '@genfeedai/models/ingredients/video.model';
import { Brand } from '@genfeedai/models/organization/brand.model';
import { Link } from '@genfeedai/models/social/link.model';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

type ModelConstructor<T> = new (partial: Partial<T>) => T;

/**
 * Ceiling on the number of pages `findAllPublicArticles` will walk. At
 * `MAX_PAGE_SIZE` per page this covers 5,000 published articles, which is far
 * beyond the current corpus while still bounding a build-time crawl if the API
 * ever stops honouring the page cursor.
 */
const MAX_PUBLIC_ARTICLE_PAGES = 50;

export class PublicService extends HTTPBaseService {
  private static classInstance?: PublicService;

  constructor() {
    super(`${EnvironmentService.apiEndpoint}/public`, '');
  }

  public static getInstance(): PublicService {
    if (!PublicService.classInstance) {
      PublicService.classInstance = new PublicService();
    }

    return PublicService.classInstance;
  }

  /**
   * Generic method to fetch a single public resource by ID
   */
  private async fetchOne<T>(
    path: string,
    Model: ModelConstructor<T>,
  ): Promise<T | null> {
    return this.instance
      .get<JsonApiResponseDocument>(path)
      .then((res) => {
        const document = res.data;
        if (!document.data) {
          return null;
        }
        return new Model(deserializeResource<Partial<T>>(document));
      })
      .catch(() => null);
  }

  /**
   * Generic method to fetch a collection of public resources
   */
  private async fetchMany<T>(
    path: string,
    Model: ModelConstructor<T>,
    query?: IQueryParams,
  ): Promise<T[]> {
    return this.instance
      .get<JsonApiResponseDocument>(path, { params: query })
      .then((res) =>
        deserializeCollection<Partial<T>>(res.data).map((d) => new Model(d)),
      )
      .catch(() => []);
  }

  public async findPublicProfileBySlug(slug: string): Promise<Brand | null> {
    return await this.instance
      .get<JsonApiResponseDocument>(`brands/slug`, {
        params: { slug },
      })
      .then((res) => {
        const document = res.data;
        if (!document.data) {
          return null;
        }

        return new Brand(deserializeResource<Partial<Brand>>(document));
      });
  }

  public async previewBrandOs(
    data: IBrandOsPreviewRequest,
  ): Promise<IBrandOsPreview> {
    return await this.instance
      .post<JsonApiResponseDocument>('brand-os/preview', data)
      .then((res) => deserializeResource<IBrandOsPreview>(res.data));
  }

  public async createPublicYoutubeClip(
    youtubeUrl: string,
    idempotencyKey: string,
  ): Promise<IPublicYoutubeClipToolSession> {
    return await this.instance
      .post<JsonApiResponseDocument>(
        'youtube-clips',
        { youtubeUrl },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      )
      .then((res) =>
        deserializeResource<IPublicYoutubeClipToolSession>(res.data),
      );
  }

  public async createPublicYoutubeLongForm(
    youtubeUrl: string,
    outputType: PublicYoutubeLongFormOutputType,
  ): Promise<IPublicYoutubeLongFormToolResult> {
    return await this.instance
      .post<JsonApiResponseDocument>('youtube-long-form', {
        outputType,
        youtubeUrl,
      })
      .then((res) =>
        deserializeResource<IPublicYoutubeLongFormToolResult>(res.data),
      );
  }

  public async getPublicYoutubeClip(
    previewToken: string,
  ): Promise<IPublicYoutubeClipToolSession> {
    return await this.instance
      .get<JsonApiResponseDocument>(`youtube-clips/${previewToken}`)
      .then((res) =>
        deserializeResource<IPublicYoutubeClipToolSession>(res.data),
      );
  }

  public async requestPublicYoutubeClipPreview(
    previewToken: string,
    recommendationId?: string,
  ): Promise<IPublicYoutubeClipToolSession> {
    return await this.instance
      .post<JsonApiResponseDocument>(`youtube-clips/${previewToken}/preview`, {
        ...(recommendationId ? { recommendationId } : {}),
      })
      .then((res) =>
        deserializeResource<IPublicYoutubeClipToolSession>(res.data),
      );
  }

  public async findPublicAccountLinks(brandId: string): Promise<Link[]> {
    return this.fetchMany(`brands/${brandId}/links`, Link);
  }

  public async trackAccountView(brandId: string): Promise<void> {
    await this.instance.post(`brands/${brandId}/views`);
  }

  public async findPublicBrands(query?: IQueryParams): Promise<Brand[]> {
    return this.fetchMany('brands', Brand, query);
  }

  public async findPublicVideos(query?: IQueryParams): Promise<Video[]> {
    return this.fetchMany('videos', Video, query);
  }

  public async findPublicImages(query?: IQueryParams): Promise<Image[]> {
    return this.fetchMany('images', Image, query);
  }

  public async findPublicMusics(query?: IQueryParams): Promise<Music[]> {
    return this.fetchMany('musics', Music, query);
  }

  public async findPublicPosts(query?: IQueryParams): Promise<Post[]> {
    return this.fetchMany('posts', Post, query);
  }

  public async findPublicPostsWithSignal(
    query?: IQueryParams,
    signal?: AbortSignal,
  ): Promise<Post[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`posts`, {
        params: query,
        signal,
      })
      .then((res) =>
        deserializeCollection<Partial<Post>>(res.data).map((d) => new Post(d)),
      );
  }

  public async getPublicVideo(id: string): Promise<Video | null> {
    return this.fetchOne(`videos/${id}`, Video);
  }

  public async getPublicImage(id: string): Promise<Image | null> {
    return this.fetchOne(`images/${id}`, Image);
  }

  public async getPublicMusic(id: string): Promise<Music | null> {
    return this.fetchOne(`musics/${id}`, Music);
  }

  public async findPublicArticles(query?: IQueryParams): Promise<Article[]> {
    return this.fetchMany('articles', Article, query);
  }

  /**
   * Every published article, for SEO surfaces (sitemap, static params) that need
   * the whole corpus. `BaseQueryDto` declares `@Max(100)` on `limit`, so a single
   * oversized request is rejected with a 400 by the API's ValidationPipe — and
   * `fetchMany` swallows that into an empty array, which silently drops every
   * article from the sitemap. Walk pages at the cap instead.
   */
  public async findAllPublicArticles(
    query?: Omit<IQueryParams, 'limit' | 'page'>,
  ): Promise<Article[]> {
    const articles: Article[] = [];

    for (let page = 1; page <= MAX_PUBLIC_ARTICLE_PAGES; page += 1) {
      const pageArticles = await this.findPublicArticles({
        ...query,
        limit: MAX_PAGE_SIZE,
        page,
      });

      articles.push(...pageArticles);

      if (pageArticles.length < MAX_PAGE_SIZE) {
        break;
      }
    }

    return articles;
  }

  public async getPublicArticle(id: string): Promise<Article | null> {
    return this.fetchOne(`articles/${id}`, Article);
  }

  /**
   * `previewToken` is the signed grant that unlocks an unpublished article.
   * Without it the API only ever returns published content.
   */
  public async getPublicArticleBySlug(
    slug: string,
    previewToken?: string,
  ): Promise<Article | null> {
    return await this.instance
      .get<JsonApiResponseDocument>(`articles/slug/${slug}`, {
        params: previewToken ? { previewToken } : {},
      })
      .then((res) => {
        const document = res.data;

        if (!document.data) {
          return null;
        }

        return new Article(deserializeResource<Partial<Article>>(document));
      })
      .catch(() => null);
  }

  public async findPublicIngredients(
    query?: IQueryParams,
  ): Promise<Ingredient[]> {
    return this.fetchMany('posts/ingredients', Ingredient, query);
  }

  public async getPublicIngredient(id: string): Promise<Ingredient | null> {
    return this.fetchOne(`posts/ingredients/${id}`, Ingredient);
  }

  public async getPublicPost(id: string): Promise<Post | null> {
    return this.fetchOne(`posts/${id}`, Post);
  }
}
