import { API_ENDPOINTS } from '@genfeedai/constants';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@genfeedai/helpers/data/json-api/json-api.helper';
import type { DefaultVoiceRef } from '@genfeedai/helpers/voice/default-voice-ref.helper';
import type {
  IActivity,
  IAnalytics,
  IArticle,
  IImage,
  IPost,
  IQueryParams,
  IVideo,
} from '@genfeedai/interfaces';
import type { BrandQueryParams } from '@genfeedai/interfaces/utils/query.interface';
import { Activity } from '@genfeedai/models/analytics/activity.model';
import { Credential } from '@genfeedai/models/auth/credential.model';
import { Article } from '@genfeedai/models/content/article.model';
import { Post } from '@genfeedai/models/content/post.model';
import { Image } from '@genfeedai/models/ingredients/image.model';
import { Video } from '@genfeedai/models/ingredients/video.model';
import { Brand } from '@genfeedai/models/organization/brand.model';
import { Link } from '@genfeedai/models/social/link.model';
import { BrandSerializer } from '@genfeedai/serializers';
import { PagesService } from '@services/content/pages.service';
import { BaseService } from '@services/core/base.service';

export class BrandsService extends BaseService<Brand> {
  constructor(token: string) {
    super(API_ENDPOINTS.BRANDS, token, Brand, BrandSerializer);
  }

  public static getInstance(token: string): BrandsService {
    return BaseService.getDataServiceInstance(
      BrandsService,
      token,
    ) as BrandsService;
  }

  public async findOneBySlug(slug: string): Promise<Brand> {
    return await this.instance
      .get<JsonApiResponseDocument>(`slug`, {
        params: {
          slug,
        },
      })
      .then((res) => this.mapOne(res.data));
  }

  public async findBrandCredentials(id: string): Promise<Credential[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`${id}/credentials`)
      .then((res) =>
        deserializeCollection<Partial<Credential>>(res.data).map(
          (item) => new Credential(item),
        ),
      );
  }

  public async findBrandLinks(id: string): Promise<Link[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/links`)
      .then((res) =>
        deserializeCollection<Partial<Link>>(res.data).map(
          (item) => new Link(item),
        ),
      );
  }

  public async findBrandActivities(
    id: string,
    query?: BrandQueryParams,
  ): Promise<Activity[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/activities`, {
        params: query,
      })
      .then((res) => {
        const document = res.data;
        const pagination = document.links?.pagination;

        if (query?.page && pagination) {
          PagesService.setCurrentPage(pagination.page);
          PagesService.setTotalPages(pagination.pages);
        }

        return deserializeCollection<Partial<IActivity>>(document).map(
          (item) => new Activity(item),
        );
      });
  }

  public async findBrandPosts(
    id: string,
    query?: IQueryParams,
  ): Promise<Post[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/posts`, {
        params: query,
      })
      .then((res) => {
        const document = res.data;
        const pagination = document.links?.pagination;

        if (query?.page && pagination) {
          PagesService.setCurrentPage(pagination.page);
          PagesService.setTotalPages(pagination.pages);
        }

        return deserializeCollection<Partial<IPost>>(document).map(
          (item) => new Post(item),
        );
      });
  }

  public async findBrandVideos(
    id: string,
    query?: IQueryParams,
  ): Promise<Video[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/videos`, { params: query })
      .then((res) => {
        const document = res.data;
        const pagination = document.links?.pagination;

        if (query?.page && pagination) {
          PagesService.setCurrentPage(pagination.page);
          PagesService.setTotalPages(pagination.pages);
        }

        return deserializeCollection<Partial<IVideo>>(document).map(
          (item) => new Video(item),
        );
      });
  }

  public async findBrandImages(
    id: string,
    query?: IQueryParams,
  ): Promise<IImage[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/images`, { params: query })
      .then((res) => {
        const document = res.data;
        const pagination = document.links?.pagination;

        if (query?.page && pagination) {
          PagesService.setCurrentPage(pagination.page);
          PagesService.setTotalPages(pagination.pages);
        }

        return deserializeCollection<Partial<IImage>>(document).map(
          (item) => new Image(item),
        );
      });
  }

  public async findBrandArticles(
    id: string,
    query?: IQueryParams,
  ): Promise<IArticle[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/articles`, {
        params: query,
      })
      .then((res) => {
        const document = res.data;
        const pagination = document.links?.pagination;

        if (query?.page && pagination) {
          PagesService.setCurrentPage(pagination.page);
          PagesService.setTotalPages(pagination.pages);
        }

        return deserializeCollection<Partial<IArticle>>(document).map(
          (item) => new Article(item as Partial<Article>),
        );
      });
  }

  public async updateAgentConfig(
    id: string,
    data: {
      defaultModel?: string;
      defaultVoiceId?: string | null;
      defaultVoiceRef?: DefaultVoiceRef | null;
      defaultAvatarPhotoUrl?: string | null;
      defaultAvatarIngredientId?: string | null;
      persona?: string;
      voice?: {
        approvedHooks?: string[];
        bannedPhrases?: string[];
        canonicalSource?: 'brand' | 'founder' | 'hybrid';
        doNotSoundLike?: string[];
        exemplarTexts?: string[];
        messagingPillars?: string[];
        sampleOutput?: string;
        tone?: string;
        style?: string;
        audience?: string[] | string;
        values?: string[];
        taglines?: string[];
        hashtags?: string[];
        writingRules?: string[];
      };
      strategy?: {
        contentTypes?: string[];
        platforms?: string[];
        frequency?: string;
        goals?: string[];
      };
      schedule?: {
        cronExpression?: string;
        timezone?: string;
        enabled?: boolean;
      };
      autoPublish?: {
        enabled?: boolean;
        confidenceThreshold?: number;
      };
      platformOverrides?: Record<
        string,
        {
          defaultModel?: string;
          persona?: string;
          voice?: {
            approvedHooks?: string[];
            bannedPhrases?: string[];
            canonicalSource?: 'brand' | 'founder' | 'hybrid';
            doNotSoundLike?: string[];
            exemplarTexts?: string[];
            messagingPillars?: string[];
            sampleOutput?: string;
            tone?: string;
            style?: string;
            audience?: string[] | string;
            values?: string[];
            taglines?: string[];
            hashtags?: string[];
            writingRules?: string[];
          };
          strategy?: {
            contentTypes?: string[];
            platforms?: string[];
            frequency?: string;
            goals?: string[];
          };
        }
      >;
    },
  ): Promise<void> {
    await this.instance.patch(`/${id}/agent-config`, data);
  }

  public async findBrandAnalytics(
    id: string,
    query?: {
      startDate?: string;
      endDate?: string;
    },
  ): Promise<IAnalytics> {
    return await this.instance
      .get<JsonApiResponseDocument>(
        `/${id}/analytics`,
        ...(query ? [{ params: query }] : []),
      )
      .then((res) => deserializeResource<IAnalytics>(res.data));
  }

  public async findBrandAnalyticsTimeSeries(
    id: string,
    query: {
      startDate: string;
      endDate: string;
      groupBy?: 'day' | 'week';
    },
  ): Promise<unknown[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/analytics/timeseries`, {
        params: query,
      })
      .then((res) => deserializeCollection<unknown>(res.data));
  }
}
