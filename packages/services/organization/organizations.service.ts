import { API_ENDPOINTS } from '@genfeedai/constants';
import { type AnalyticsMetric, IngredientCategory } from '@genfeedai/enums';
import type {
  IActivity,
  IAnalytics,
  IByokProviderStatus,
  IDarkroomCapabilities,
  IIngredient,
  IMember,
  IMemberInvitation,
  IOrganizationSetting,
  IPost,
  IQueryParams,
  ISubscription,
  UpdateMemberData,
} from '@genfeedai/interfaces';
import {
  MemberInvitationSerializer,
  OrganizationSerializer,
  OrganizationSettingSerializer,
} from '@genfeedai/serializers';
import { deserializeCollection } from '@helpers/data/json-api/json-api.helper';
import { Avatar } from '@models/ai/avatar.model';
import { Activity } from '@models/analytics/activity.model';
import { Ingredient } from '@models/content/ingredient.model';
import { Post } from '@models/content/post.model';
import { Tag } from '@models/content/tag.model';
import { Image } from '@models/ingredients/image.model';
import { Music } from '@models/ingredients/music.model';
import { Video } from '@models/ingredients/video.model';
import { Voice } from '@models/ingredients/voice.model';
import { Brand } from '@models/organization/brand.model';
import { Member } from '@models/organization/member.model';
import { Organization } from '@models/organization/organization.model';
import { OrganizationSetting } from '@models/organization/organization-setting.model';
import { PagesService } from '@services/content/pages.service';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export class OrganizationsService extends BaseService<Organization> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.ORGANIZATIONS,
      token,
      Organization,
      OrganizationSerializer,
    );
  }

  public static getInstance(token: string): OrganizationsService {
    return BaseService.getDataServiceInstance(
      OrganizationsService,
      token,
    ) as OrganizationsService;
  }

  public async findOrganizationBrands(
    id: string,
    query?: IQueryParams,
  ): Promise<Brand[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/brands`, {
        params: query,
      })
      .then((res) => {
        const document = res.data;
        const pagination = document.links?.pagination;

        if (query?.page && pagination) {
          PagesService.setCurrentPage(pagination.page);
          PagesService.setTotalPages(pagination.pages);
        }

        const accounts = this.extractCollection<Partial<Brand>>(document);
        return accounts.map((item) => new Brand(item));
      });
  }

  public async findOrganizationMembers(
    id: string,
    query?: IQueryParams,
  ): Promise<Member[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/members`, {
        params: query,
      })
      .then((res) => {
        const members = this.extractCollection<Partial<IMember>>(res.data);
        return members.map((item) => new Member(item));
      });
  }

  public async findOrganizationTags(
    id: string,
    query?: IQueryParams,
  ): Promise<Tag[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/tags`, { params: query })
      .then((res) => {
        const tags = this.extractCollection<Partial<Tag>>(res.data);
        return tags.map((item) => new Tag(item));
      });
  }

  public async findOrganizationIngredients(
    id: string,
    query?: IQueryParams,
  ): Promise<Ingredient[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/ingredients`, {
        params: query,
      })
      .then((res) => {
        const document = res.data;
        const pagination = document.links?.pagination;

        if (query?.page && pagination) {
          PagesService.setCurrentPage(pagination.page);
          PagesService.setTotalPages(pagination.pages);
        }

        return this.extractCollection<Partial<IIngredient>>(document).map(
          (item) => {
            // Determine category from item.category (each item may have different category)
            const category = item.category || IngredientCategory.VIDEO;

            // Map to appropriate model class based on category
            switch (category) {
              case IngredientCategory.VIDEO:
                return new Video(item);
              case IngredientCategory.IMAGE:
                return new Image(item);
              case IngredientCategory.MUSIC:
                return new Music(item);
              case IngredientCategory.VOICE:
                return new Voice(item);
              case IngredientCategory.AVATAR:
                return new Avatar(item);
              default:
                // Fallback to base Ingredient if category doesn't match
                return new Ingredient(item);
            }
          },
        );
      });
  }

  public async findOrganizationSubscription(
    id: string,
  ): Promise<ISubscription | null> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/subscription`)
      .then((res) => {
        const document = res.data;
        if (!document.data) {
          return null;
        }

        return this.extractResource<ISubscription>(document);
      });
  }

  public async getSettings(id: string): Promise<IOrganizationSetting> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/settings`)
      .then(
        (res) =>
          new OrganizationSetting(
            this.extractResource<IOrganizationSetting>(res.data),
          ),
      );
  }

  public async patchSettings(
    id: string,
    data: Partial<IOrganizationSetting>,
  ): Promise<IOrganizationSetting> {
    const body = OrganizationSettingSerializer.serialize(data);
    return await this.instance
      .patch<JsonApiResponseDocument>(`/${id}/settings`, body)
      .then(
        (res) =>
          new OrganizationSetting(
            this.extractResource<IOrganizationSetting>(res.data),
          ),
      );
  }

  public async getDarkroomCapabilities(
    organizationId: string,
    brandId: string,
  ): Promise<IDarkroomCapabilities> {
    return await this.instance
      .get<JsonApiResponseDocument>(
        `/${organizationId}/brands/${brandId}/darkroom-capabilities`,
      )
      .then((res) => this.extractResource<IDarkroomCapabilities>(res.data));
  }

  public async inviteMember(
    id: string,
    data: IMemberInvitation,
  ): Promise<Member> {
    const body = MemberInvitationSerializer.serialize(data);

    return await this.instance
      .post<JsonApiResponseDocument>(`/${id}/members`, body)
      .then((res) => res.data)
      .then((res) => new Member(this.extractResource<Partial<IMember>>(res)));
  }

  public async updateOrganizationMember(
    organizationId: string,
    memberId: string,
    data: UpdateMemberData,
  ): Promise<Member> {
    return await this.instance
      .patch<JsonApiResponseDocument>(
        `/${organizationId}/members/${memberId}`,
        data,
      )
      .then((res) => res.data)
      .then((res) => new Member(this.extractResource<Partial<IMember>>(res)));
  }

  public async findOrganizationActivities(
    id: string,
    query?: IQueryParams,
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

        const activities = this.extractCollection<Partial<IActivity>>(document);
        return activities.map((item) => new Activity(item));
      });
  }

  public async findOrganizationPosts(
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

        const posts = this.extractCollection<Partial<IPost>>(document);
        return posts.map((item) => new Post(item));
      });
  }

  public async findOrganizationAnalytics(
    id: string,
    query?: {
      timeframe?: '7d' | '30d' | '90d';
      brandId?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<IAnalytics> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/analytics`, { params: query })
      .then((res) => this.extractResource<IAnalytics>(res.data));
  }

  public async findOrganizationAnalyticsTimeSeries(
    id: string,
    query: {
      startDate: string;
      endDate: string;
      groupBy?: 'day' | 'week';
      brandId?: string;
    },
  ): Promise<unknown[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/analytics/timeseries`, {
        params: query,
      })
      .then((res) => deserializeCollection<unknown>(res.data));
  }

  public async findOrganizationAnalyticsPlatforms(
    id: string,
    query?: { timeframe?: '7d' | '30d' | '90d'; brandId?: string },
  ): Promise<unknown[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/analytics/platforms`, {
        params: query,
      })
      .then((res) => deserializeCollection<unknown>(res.data));
  }

  public async findOrganizationAnalyticsTopContent(
    id: string,
    query?: {
      limit?: number;
      metric?: AnalyticsMetric.VIEWS | AnalyticsMetric.ENGAGEMENT;
      timeframe?: '7d' | '30d' | '90d';
      brandId?: string;
    },
  ): Promise<unknown[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/${id}/analytics/top-content`, {
        params: query,
      })
      .then((res) => deserializeCollection<unknown>(res.data));
  }

  /**
   * Resolve an organization by its URL slug.
   */
  public async findBySlug(slug: string): Promise<Organization> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/by-slug/${slug}`)
      .then((res) => {
        return new Organization(
          this.extractResource<Partial<Organization>>(res.data),
        );
      });
  }

  /**
   * Returns all organizations the current user belongs to.
   * Cross-org endpoint — not scoped to active org.
   */
  public async getMyOrganizations(): Promise<
    {
      id: string;
      label: string;
      slug: string;
      isActive: boolean;
      brand: { id: string; label: string } | null;
    }[]
  > {
    return await this.instance
      .get<
        {
          id: string;
          label: string;
          slug: string;
          isActive: boolean;
          brand: { id: string; label: string } | null;
        }[]
      >('/mine')
      .then((res) => res.data);
  }

  /**
   * Switch the active organization. Updates Clerk publicMetadata server-side.
   * Call window.location.reload() after this to re-sync session.
   */
  public async switchOrganization(orgId: string): Promise<{
    organization: { id: string; label: string };
    brand: { id: string; label: string };
  }> {
    return await this.instance
      .post<{
        organization: { id: string; label: string };
        brand: { id: string; label: string };
      }>(`/switch/${orgId}`)
      .then((res) => res.data);
  }

  /**
   * Create a new organization and switch to it.
   */
  public async createOrganization(data: {
    label: string;
    description?: string;
  }): Promise<{
    organization: { id: string; label: string };
    brand: { id: string; label: string };
  }> {
    return await this.instance
      .post<{
        organization: { id: string; label: string };
        brand: { id: string; label: string };
      }>('/create', data)
      .then((res) => res.data);
  }

  public async getByokAllProviders(
    orgId: string,
  ): Promise<IByokProviderStatus[]> {
    return await this.instance
      .get(`/${orgId}/settings/byok`)
      .then((res) => res.data);
  }

  public async getByokProviderStatus(
    orgId: string,
    provider: string,
  ): Promise<IByokProviderStatus> {
    return await this.instance
      .get(`/${orgId}/settings/byok/${provider}`)
      .then((res) => res.data);
  }

  public async validateByokProviderKey(
    orgId: string,
    provider: string,
    apiKey: string,
    apiSecret?: string,
  ): Promise<{ isValid: boolean; error?: string }> {
    return await this.instance
      .post(`/${orgId}/settings/byok/${provider}/validate`, {
        apiKey,
        apiSecret,
      })
      .then((res) => res.data);
  }

  public async saveByokProviderKey(
    orgId: string,
    provider: string,
    apiKey: string,
    apiSecret?: string,
  ): Promise<void> {
    await this.instance.put(`/${orgId}/settings/byok/${provider}`, {
      apiKey,
      apiSecret,
    });
  }

  public async removeByokProviderKey(
    orgId: string,
    provider: string,
  ): Promise<void> {
    await this.instance.delete(`/${orgId}/settings/byok/${provider}`);
  }

  public async toggleModel(
    organizationId: string,
    modelId: string,
    enabled: boolean,
  ): Promise<IOrganizationSetting> {
    // Fetch current settings to get enabledModels array
    const currentSettings = await this.getSettings(organizationId);
    const enabledModels = currentSettings.enabledModels || [];

    // Add or remove modelId from array
    let updatedEnabledModels: string[];
    if (enabled) {
      // Add model if not already in the array
      if (!enabledModels.includes(modelId)) {
        updatedEnabledModels = [...enabledModels, modelId];
      } else {
        // Already enabled, return current settings
        return currentSettings;
      }
    } else {
      // Remove model from array
      updatedEnabledModels = enabledModels.filter((id) => id !== modelId);
    }

    // Update settings using general PATCH endpoint
    return await this.patchSettings(organizationId, {
      enabledModels: updatedEnabledModels,
    });
  }
}
