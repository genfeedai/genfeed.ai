import { API_ENDPOINTS } from '@genfeedai/constants';
import type { ReferenceImageCategory } from '@genfeedai/enums';
import type { DefaultVoiceRef } from '@genfeedai/helpers/voice/default-voice-ref.helper';
import type {
  FastlaneGenerateIdeasRequest,
  FastlaneIdea,
  IActivity,
  IAnalytics,
  IArticle,
  IBrandAgentPrompting,
  IBrandKitApplyRequest,
  IBrandKitApplyResult,
  IBrandKitAssetImportRequest,
  IBrandKitAssetImportResponse,
  IBrandKitDraft,
  IBrandKitManualInput,
  IBrandSetupRequest,
  IBrandSetupResponse,
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
      prompting?: IBrandAgentPrompting;
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
        topics?: string[];
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
            topics?: string[];
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

  public async importBrandKitAssets(
    id: string,
    data: IBrandKitAssetImportRequest,
  ): Promise<IBrandKitAssetImportResponse> {
    return await this.instance
      .post<{ data: IBrandKitAssetImportResponse }>(
        `/${id}/brand-kit/assets/import`,
        data,
      )
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
   * Scrape the brand's website/socials, analyze with AI, and populate canonical
   * brand guidance. Backs `POST /brands/:id/scrape` (renamed from the dissolved
   * `POST /onboarding/brand-setup`, REST audit #1354). Returns the plain
   * orchestration envelope, not a JSON:API resource.
   */
  public async scrape(
    id: string,
    dto: IBrandSetupRequest,
  ): Promise<IBrandSetupResponse> {
    return await this.instance
      .post<IBrandSetupResponse>(`/${id}/scrape`, dto)
      .then((res) => res.data);
  }

  /**
   * Rename a brand and, during the first-login onboarding window, cascade the
   * new name to the owning organization's label + slug. Backs the
   * `syncOrganizationName` path of `PATCH /brands/:id` (dissolves
   * `PATCH /onboarding/brand-name`, REST audit #1354).
   */
  public async renameWithOrganizationSync(
    id: string,
    label: string,
    options: {
      agentConfig?: {
        voice?: {
          audience?: string[] | string;
          tone?: string;
        };
      };
      description?: string;
      organizationLabel?: string;
      text?: string;
    } = {},
  ): Promise<Brand> {
    return await this.instance
      .patch<JsonApiResponseDocument>(`/${id}`, {
        ...options,
        label,
        syncOrganizationName: true,
      })
      .then((res) => this.mapOne(res.data));
  }

  /**
   * Add reference images (face, product, style, logo) to a brand. Backs
   * `POST /brands/:id/reference-images` (dissolves the onboarding route,
   * REST audit #1354).
   */
  public async addReferenceImages(
    id: string,
    images: Array<{
      url: string;
      category: ReferenceImageCategory;
      label?: string;
      isDefault?: boolean;
    }>,
  ): Promise<{ success: boolean; count: number }> {
    return await this.instance
      .post<{ success: boolean; count: number }>(`/${id}/reference-images`, {
        images,
      })
      .then((res) => res.data);
  }

  /**
   * Previews the impact of moving a brand to a destination organization.
   * Read-only. `movingResources` lists non-zero brand-owned resource counts
   * whose organization scope will be rewritten with the brand.
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
   * `relocationAck` is still accepted for older clients but current workflow
   * relocation no longer needs clone/disconnect acknowledgement.
   */
  public async relocateBrand(
    id: string,
    body: IBrandRelocationPatchBody,
  ): Promise<IBrandRelocationResult> {
    const cleanedBody = BaseService.cleanBody(body);

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
