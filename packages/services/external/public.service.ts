import type { IQueryParams } from '@genfeedai/interfaces';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@helpers/data/json-api/json-api.helper';
import { Article } from '@models/content/article.model';
import { Ingredient } from '@models/content/ingredient.model';
import { Post } from '@models/content/post.model';
import { Image } from '@models/ingredients/image.model';
import { Music } from '@models/ingredients/music.model';
import { Video } from '@models/ingredients/video.model';
import { Brand } from '@models/organization/brand.model';
import { Link } from '@models/social/link.model';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

type ModelConstructor<T> = new (partial: Partial<T>) => T;

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
      );
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

  public async getPublicArticle(id: string): Promise<Article | null> {
    return this.fetchOne(`articles/${id}`, Article);
  }

  public async getPublicArticleBySlug(
    slug: string,
    isPreview: boolean = false,
  ): Promise<Article | null> {
    return await this.instance
      .get<JsonApiResponseDocument>(`articles/slug/${slug}`, {
        params: { isPreview: isPreview.toString() },
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
