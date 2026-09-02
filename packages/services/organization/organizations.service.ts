import {
  type AnalyticsMetric,
  IngredientCategory,
  type OrganizationCategory,
} from '@genfeedai/contracts';
import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  IActivity,
  IAnalytics,
  IByokProviderStatus,
  IFleetCapabilities,
  IIngredient,
  IMember,
  IMemberInvitation,
  IOrganization,
  IOrganizationSetting,
  IPaginatedResponse,
  IPost,
  IQueryParams,
  ISubscription,
  IWebhookDeliveryStatus,
  UpdateMemberData,
} from '@genfeedai/contracts/interfaces';
import { Avatar } from '@genfeedai/models/ai/avatar.model';
import { Activity } from '@genfeedai/models/analytics/activity.model';
import { Ingredient } from '@genfeedai/models/content/ingredient.model';
import { Post } from '@genfeedai/models/content/post.model';
import { Tag } from '@genfeedai/models/content/tag.model';
import { Image } from '@genfeedai/models/ingredients/image.model';
import { Music } from '@genfeedai/models/ingredients/music.model';
import { Video } from '@genfeedai/models/ingredients/video.model';
import { Voice } from '@genfeedai/models/ingredients/voice.model';
import { Brand } from '@genfeedai/models/organization/brand.model';
import { Member } from '@genfeedai/models/organization/member.model';
import { Organization } from '@genfeedai/models/organization/organization.model';
import { OrganizationSetting } from '@genfeedai/models/organization/organization-setting.model';
import {
  MemberInvitationSerializer,
  OrganizationSerializer,
  OrganizationSettingSerializer,
} from '@genfeedai/serializers';
import { PagesService } from '@services/content/pages.service';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';
import { EnvironmentService } from '@services/core/environment.service';
import { deserializeCollection } from '@services/core/json-api';

const ORGANIZATION_LIST_PAGE_SIZE = 100;

/**
 * Cross-org membership summary returned by `GET /organizations?mine=true`. A bespoke
 * projection (not a serialized Organization) consumed structurally by the org
 * switcher, post-signup routing, and scope controls.
 */
type MyOrganizationSummary = {
  id: string;
  label: string;
  slug: string;
  isActive: boolean;
  isOwner: boolean;
  brand: { id: string; label: string } | null;
};

export class OrganizationsService extends BaseService<Organization> {
  /**
   * In-flight `GET /organizations?mine=true` request shared across concurrent
   * callers. Null when no request is pending. See {@link getMyOrganizations}.
   */
  private myOrganizationsInFlight: Promise<MyOrganizationSummary[]> | null =
    null;

  constructor(token: string) {
    super(
      API_ENDPOINTS.ORGANIZATIONS,
      token,
      Organization,
      OrganizationSerializer,
    );
  }

  public static getInstance(token: string): OrganizationsService {
    return BaseService.getDataServiceInstance(OrganizationsService, token);
  }

  public async findOrganizationBrands(
    id: string,
    query?: IQueryParams,
  ): Promise<Brand[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(
        `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.BRANDS}`,
        { params: { ...query, organizationId: id } },
      )
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
    // Collection endpoint: GET /tags?organization=
    return await this.instance
      .get<JsonApiResponseDocument>(
        `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.TAGS}`,
        { params: { ...query, organizationId: id } },
      )
      .then((res) => {
        const tags = this.extractCollection<Partial<Tag>>(res.data);
        return tags.map((item) => new Tag(item));
      });
  }

  public async findOrganizationIngredients(
    id: string,
    query?: IQueryParams,
  ): Promise<Ingredient[]> {
    // Mixed-category ingredient list still lives on the org relationship route;
    // typed collections (/videos, /images, …) cover single-category surfaces.
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

  public async testWebhookDelivery(
    id: string,
    data: { event?: string } = {},
  ): Promise<IWebhookDeliveryStatus> {
    return await this.instance
      .post<{ data: IWebhookDeliveryStatus }>(
        `/${id}/settings/webhooks/test`,
        data,
      )
      .then((res) => res.data.data);
  }

  /**
   * Set the organization's onboarding account type. Backs the dissolved
   * `POST /onboarding/account-type` via `PATCH /organizations/:id` (REST audit
   * #1354). Writes both `accountType` and the legacy `category` alias for parity.
   */
  public async updateAccountType(
    id: string,
    category: OrganizationCategory,
  ): Promise<Organization> {
    return await this.instance
      .patch<JsonApiResponseDocument>(`/${id}`, {
        accountType: category,
        category,
      })
      .then(
        (res) =>
          new Organization(
            this.extractResource<Partial<IOrganization>>(res.data),
          ),
      );
  }

  public async getFleetCapabilities(
    organizationId: string,
    brandId: string,
  ): Promise<IFleetCapabilities> {
    return await this.instance
      .get<JsonApiResponseDocument>(
        `/${organizationId}/brands/${brandId}/fleet-capabilities`,
      )
      .then((res) => this.extractResource<IFleetCapabilities>(res.data));
  }

  public async inviteMember(
    id: string,
    data: IMemberInvitation,
  ): Promise<IMemberInvitation> {
    const body = MemberInvitationSerializer.serialize(data);

    return await this.instance
      .post<JsonApiResponseDocument>(`/${id}/members`, body)
      .then((res) => res.data)
      .then((res) => this.extractResource<IMemberInvitation>(res));
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
      .get<JsonApiResponseDocument>(
        `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.ACTIVITIES}`,
        { params: { ...query, organizationId: id } },
      )
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
    const result = await this.findOrganizationPostsPage(id, query);
    if (query?.page) {
      PagesService.setCurrentPage(result.page);
      PagesService.setTotalPages(result.totalPages);
      PagesService.setTotalDocs(result.total);
    }

    return result.items;
  }

  public async findOrganizationPostsPage(
    id: string,
    query?: IQueryParams,
  ): Promise<IPaginatedResponse<Post>> {
    return await this.instance
      .get<JsonApiResponseDocument>(
        `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.POSTS}`,
        { params: { ...query, organizationId: id } },
      )
      .then((response) => {
        const document = response.data;
        const items = this.extractCollection<Partial<IPost>>(document).map(
          (item) => new Post(item),
        );
        const pagination = document.links?.pagination;
        const page = pagination?.page ?? 1;
        const totalPages = Math.max(1, pagination?.pages ?? 1);

        return {
          hasNext: page < totalPages,
          hasPrevious: page > 1,
          items,
          page,
          pageSize: pagination?.limit ?? items.length,
          total: pagination?.total ?? items.length,
          totalPages,
        };
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
  public getMyOrganizations(): Promise<MyOrganizationSummary[]> {
    // Coalesce concurrent callers onto a single request. The protected sidebar
    // mounts OrganizationSwitcher twice at once (desktop + CSS-hidden mobile),
    // so a naive fetch fires GET ?mine=true ×2 on every shell mount. BaseService
    // pools this service per auth token (getDataServiceInstance), so this
    // in-flight promise is shared across both mounts and is automatically
    // identity-scoped: a different token resolves to a different pooled
    // instance with its own field. Mirrors the /token in-flight dedupe in
    // packages/auth-client/src/client.ts.
    if (this.myOrganizationsInFlight) {
      return this.myOrganizationsInFlight;
    }

    const request = this.instance
      .get<MyOrganizationSummary[]>('', { params: { mine: true } })
      .then((res) =>
        // Defensive dedup by org id: a duplicate entry here renders twice in
        // the org switcher with the active checkmark on both rows (the
        // checkmark matches by id). The API dedups too; this guards consumers
        // against any regression in that contract.
        res.data.filter(
          (org, index, list) =>
            list.findIndex((candidate) => candidate.id === org.id) === index,
        ),
      )
      .finally(() => {
        // Clear only if still the active request. In-flight-only (no TTL): once
        // settled, the next mount cycle refetches fresh membership data.
        if (this.myOrganizationsInFlight === request) {
          this.myOrganizationsInFlight = null;
        }
      });

    this.myOrganizationsInFlight = request;

    return request;
  }

  /**
   * Returns all organizations on the platform. Backed by the superadmin-gated
   * `GET /organizations` list endpoint — callers must be a platform superadmin, or
   * the request 403s. Used to populate the destination picker when a superadmin
   * relocates a brand to any organization.
   */
  public async getAllOrganizations(): Promise<
    { id: string; label: string; slug: string }[]
  > {
    return await this.collectAllPages<{
      id: string;
      label: string;
      slug: string;
    }>({ limit: ORGANIZATION_LIST_PAGE_SIZE }, async (pageQuery) => {
      const document = await this.instance
        .get<JsonApiResponseDocument>('', { params: pageQuery })
        .then((res) => res.data);

      return {
        items: this.extractCollection<Partial<Organization>>(document).map(
          (organization) => ({
            id: String(organization.id),
            label: organization.label ?? '',
            slug: organization.slug ?? '',
          }),
        ),
        totalPages: document.links?.pagination?.pages ?? 1,
      };
    });
  }

  /**
   * Switch the active organization. Follow with a client navigation to the
   * new org slug so the shell stays mounted.
   */
  public async switchOrganization(orgId: string): Promise<{
    organization: { id: string; label: string };
    brand: { id: string; label: string };
  }> {
    return await this.instance
      .patch<{
        organization: { id: string; label: string };
        brand: { id: string; label: string };
      }>(`/${orgId}/activate`)
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
      }>('', data)
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
    this.dispatchTopbarBalanceRefresh();
  }

  public async removeByokProviderKey(
    orgId: string,
    provider: string,
  ): Promise<void> {
    await this.instance.delete(`/${orgId}/settings/byok/${provider}`);
    this.dispatchTopbarBalanceRefresh();
  }

  private dispatchTopbarBalanceRefresh(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.dispatchEvent(new CustomEvent('genfeed:topbar-balances:refresh'));
  }

  public async toggleModel(
    organizationId: string,
    modelId: string,
    enabled: boolean,
  ): Promise<IOrganizationSetting> {
    // Fetch the current canonical model allowlist.
    const currentSettings = await this.getSettings(organizationId);
    const enabledModelIds = currentSettings.enabledModelIds || [];

    let updatedEnabledModelIds: string[];
    if (enabled) {
      if (!enabledModelIds.includes(modelId)) {
        updatedEnabledModelIds = [...enabledModelIds, modelId];
      } else {
        return currentSettings;
      }
    } else {
      updatedEnabledModelIds = enabledModelIds.filter((id) => id !== modelId);
    }

    return await this.patchSettings(organizationId, {
      enabledModelIds: updatedEnabledModelIds,
    });
  }
}
