import { API_ENDPOINTS } from '@genfeedai/constants';
import type { DefaultVoiceRef } from '@genfeedai/helpers/voice/default-voice-ref.helper';
import type {
  FastlaneGenerateIdeasRequest,
  FastlaneIdea,
  IActivity,
  IAnalytics,
  IArticle,
  IBrandKitApplyRequest,
  IBrandKitApplyResult,
  IBrandKitDraft,
  IBrandKitManualInput,
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
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';
import type {
  IBrandRelocationPatchBody,
  IBrandRelocationPreview,
  IBrandRelocationResult,
  IBrandRelocationSummary,
} from '@services/social/brand-relocation.types';

export class BrandsService extends BaseService<Brand> {
  constructor(token: string) {
    super(API_ENDPOINTS.BRANDS, token, Brand, BrandSerializer);
  }

  public static getInstance(token: string): BrandsService {
    return BaseService.getDataServiceInstance(BrandsService, token);
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
      heygenAvatarId?: string | null;
      heygenVoiceId?: string | null;
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

  public async crawlBrandKitWebsite(
    id: string,
    data: {
      socialUrls?: string[];
      url: string;
    },
  ): Promise<IBrandKitDraft> {
    return await this.instance
      .post<{ data: IBrandKitDraft }>(`/${id}/brand-kit/crawl`, data)
      .then((res) => res.data.data);
  }

  public async applyBrandKitDraft(
    id: string,
    data: Omit<IBrandKitApplyRequest, 'brandId'>,
  ): Promise<IBrandKitApplyResult> {
    return await this.instance
      .post<{ data: IBrandKitApplyResult }>(`/${id}/brand-kit/apply`, data)
      .then((res) => res.data.data);
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

  /**
   * Generates a batch of brand-data-driven Fastlane content ideas. The ideas
   * endpoint returns a plain `{ data: FastlaneIdea[] }` envelope (not JSON:API),
   * mirroring the brand-voice generation endpoint.
   */
  public async generateFastlaneIdeas(
    id: string,
    dto: FastlaneGenerateIdeasRequest,
  ): Promise<FastlaneIdea[]> {
    return await this.instance
      .post<{ data: FastlaneIdea[] }>(`/${id}/fastlane/ideas`, dto)
      .then((res) => res.data?.data ?? []);
  }

  public async createManualBrandKitDraft(
    id: string,
    data: IBrandKitManualInput,
  ): Promise<IBrandKitDraft> {
    return await this.instance
      .post<JsonApiResponseDocument>(`/${id}/brand-kit/manual`, data)
      .then((res) => deserializeResource<IBrandKitDraft>(res.data));
  }

  /**
   * Previews the clone/severance impact of moving a brand to a destination
   * organization. Read-only. `ackToken` is `null` when there's no clone
   * impact (no shared workflows attached to the brand), meaning the
   * relocation patch does not need to pass `relocationAck`.
   */
  public async getRelocationPreview(
    id: string,
    destOrganizationId: string,
  ): Promise<IBrandRelocationPreview> {
    return await this.instance
      .get<{ data: IBrandRelocationPreview }>(`/${id}/relocation-preview`, {
        params: { organizationId: destOrganizationId },
      })
      .then((res) => res.data.data);
  }

  /**
   * Moves a brand to another organization. Unlike the generic `patch()`
   * (which maps the JSON:API document to an entity and drops the
   * top-level `meta`), this reads the raw response so callers get both
   * the updated brand AND the relocation summary
   * (`workflowsMoved`, `workflowsClonedActive`, `workflowsClonedPaused`,
   * `membersSevered`, `schedulingPending`).
   *
   * Pass `relocationAck` = the `ackToken` from `getRelocationPreview()`.
   * It is required whenever the preview's `counts.sharedWorkflows > 0` —
   * the server returns 409 otherwise (or if the impacted set changed
   * since the preview was taken).
   */
  public async relocateBrand(
    id: string,
    body: IBrandRelocationPatchBody,
  ): Promise<IBrandRelocationResult> {
    const cleanedBody: Record<string, unknown> = {};
    for (const key in body) {
      const value = body[key as keyof IBrandRelocationPatchBody];
      if (value !== undefined && value !== null && value !== 'undefined') {
        cleanedBody[key] = value;
      }
    }

    return await this.instance
      .patch<JsonApiResponseDocument>(`/${id}`, cleanedBody)
      .then(async (res) => {
        const document = res.data;
        const brand = await this.mapOne(document);
        const summary = (document.meta ??
          {}) as unknown as IBrandRelocationSummary;

        return { brand, summary };
      });
  }
}
