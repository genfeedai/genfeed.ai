import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import {
  type AccessBootstrapCachePayload,
  AccessBootstrapCacheService,
} from '@api/common/services/access-bootstrap-cache.service';
import { ConfigService } from '@api/config/config.service';
import {
  getIsSuperAdmin,
  getPublicMetadata,
  getStripeSubscriptionStatus,
  getSubscriptionTier,
} from '@api/helpers/utils/clerk/clerk.util';
import {
  BatchGenerationService,
  ReviewInboxSummary,
} from '@api/services/batch-generation/batch-generation.service';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import type { IAnalytics, IBrand } from '@genfeedai/interfaces';
import type { AgentRunStats } from '@genfeedai/types';
import { Injectable } from '@nestjs/common';
import { toPlainJson } from '@serializers/helpers/plain-json.helper';
import axios from 'axios';

export interface AuthBootstrapRequest extends RequestWithContext {}

export interface OverviewBootstrapPayload {
  activeRuns: unknown[];
  analytics: Partial<IAnalytics>;
  reviewInbox: ReviewInboxSummary;
  runs: unknown[];
  stats: AgentRunStats | null;
  timeSeries: unknown[];
}

function getBrandId(
  record: { id?: unknown; _id?: unknown } | null | undefined,
): string {
  if (typeof record?.id === 'string') {
    return record.id;
  }

  if (
    record &&
    typeof record === 'object' &&
    '_id' in record &&
    typeof record._id === 'string'
  ) {
    return record._id;
  }

  return '';
}

type BootstrapBaseData = Pick<
  AccessBootstrapCachePayload,
  'access' | 'brands' | 'currentUser' | 'settings'
> & {
  cachedPayload?: AccessBootstrapCachePayload;
};

type OverviewBootstrapCacheEntry = {
  expiresAt: number;
  payload: OverviewBootstrapPayload;
};

const OVERVIEW_BOOTSTRAP_CACHE_TTL_MS = 10_000;
const OVERVIEW_BOOTSTRAP_CACHE_MAX_ENTRIES = 100;

@Injectable()
export class AuthBootstrapService {
  private readonly overviewBootstrapCache = new Map<
    string,
    OverviewBootstrapCacheEntry
  >();

  constructor(
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
    private readonly agentRunsService: AgentRunsService,
    private readonly analyticsAggregationService: AnalyticsAggregationService,
    private readonly brandsService: BrandsService,
    private readonly configService: ConfigService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly credentialsService: CredentialsService,
    private readonly batchGenerationService: BatchGenerationService,
    private readonly fleetService: FleetService,
    private readonly membersService: MembersService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly streaksService: StreaksService,
    private readonly usersService: UsersService,
  ) {}

  private getOverviewBootstrapCacheKey(
    access: AccessBootstrapCachePayload['access'],
  ): string {
    return [
      access.organizationId,
      access.brandId || 'no-brand',
      access.userId || 'no-user',
    ].join(':');
  }

  private getOverviewBootstrapRequestCacheKey(
    request: AuthBootstrapRequest,
  ): string | null {
    const publicMetadata: Partial<ReturnType<typeof getPublicMetadata>> =
      request.user ? getPublicMetadata(request.user) : {};
    const organizationId =
      request.context?.organizationId ?? publicMetadata.organization ?? '';

    if (!organizationId) {
      return null;
    }

    const brandId = request.context?.brandId ?? publicMetadata.brand ?? '';
    const userId = request.context?.userId ?? publicMetadata.user ?? '';

    return [organizationId, brandId || 'no-brand', userId || 'no-user'].join(
      ':',
    );
  }

  private getCachedOverviewBootstrap(
    key: string,
  ): OverviewBootstrapPayload | null {
    const cached = this.overviewBootstrapCache.get(key);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.overviewBootstrapCache.delete(key);
      return null;
    }

    return cached.payload;
  }

  private setCachedOverviewBootstrap(
    key: string,
    payload: OverviewBootstrapPayload,
  ): void {
    if (
      this.overviewBootstrapCache.size >= OVERVIEW_BOOTSTRAP_CACHE_MAX_ENTRIES
    ) {
      const firstKey = this.overviewBootstrapCache.keys().next().value;
      if (firstKey) {
        this.overviewBootstrapCache.delete(firstKey);
      }
    }

    this.overviewBootstrapCache.set(key, {
      expiresAt: Date.now() + OVERVIEW_BOOTSTRAP_CACHE_TTL_MS,
      payload,
    });
  }

  private async isLlmAvailable(): Promise<boolean> {
    const llmUrl = String(this.configService.get('GPU_LLM_URL') || '');

    if (!llmUrl) {
      return false;
    }

    try {
      await axios.get(`${llmUrl}/v1/health`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  private async buildDarkroomCapabilities(
    organizationId: string,
    brandId: string,
    isBrandEnabled: boolean,
  ) {
    const [images, videos, voices, llm] = await Promise.all([
      this.fleetService.isAvailable('images'),
      this.fleetService.isAvailable('videos'),
      this.fleetService.isAvailable('voices'),
      this.isLlmAvailable(),
    ]);

    return {
      brandEnabled: isBrandEnabled,
      brandId,
      fleet: {
        images,
        llm,
        videos,
        voices,
      },
      id: `darkroom-capabilities:${organizationId}:${brandId}`,
      organizationId,
    };
  }

  private async getAccessibleBrands(
    organizationId: string,
    userId: string,
    isSuperAdmin: boolean,
  ) {
    if (!isSuperAdmin) {
      await this.membersService.findOne({
        isDeleted: false,
        organization: organizationId,
        user: userId,
      });
    }

    return await this.brandsService.findForOrganization(organizationId, {
      brandIds: undefined,
    });
  }

  private serializeRecord<T>(value: T | null | undefined): T | null {
    if (value == null) {
      return null;
    }

    const recordWithToObject = value as T & {
      toObject?: () => unknown;
    };
    const serializableValue =
      typeof recordWithToObject.toObject === 'function'
        ? recordWithToObject.toObject()
        : value;

    return toPlainJson(serializableValue) as T;
  }

  private async resolveBootstrapBase(
    request: AuthBootstrapRequest,
  ): Promise<BootstrapBaseData> {
    const user = request.user;
    const publicMetadata: Partial<ReturnType<typeof getPublicMetadata>> = user
      ? getPublicMetadata(user)
      : {};
    const clerkUserId = user?.id ?? '';
    const requestContext = request.context;
    const userId = requestContext?.userId ?? publicMetadata.user ?? '';
    const organizationId =
      requestContext?.organizationId ?? publicMetadata.organization ?? '';
    const brandId = requestContext?.brandId ?? publicMetadata.brand ?? '';
    const subscriptionStatus =
      requestContext?.stripeSubscriptionStatus ??
      (user ? getStripeSubscriptionStatus(user, request) : '');
    const subscriptionTier =
      requestContext?.subscriptionTier ??
      (user ? getSubscriptionTier(user, request) : '');

    if (clerkUserId && organizationId) {
      const cached = await this.accessBootstrapCacheService.get(
        clerkUserId,
        organizationId,
      );
      if (cached) {
        return {
          access: cached.access,
          brands: cached.brands,
          cachedPayload: cached,
          currentUser: cached.currentUser,
          settings: cached.settings,
        };
      }
    }

    const hasValidUserId = true;
    const hasValidOrganizationId = true;
    const isSuperAdmin = user ? getIsSuperAdmin(user, request) : false;

    const [dbUser, organizationSettings, creditsBalance, brands] =
      await Promise.all([
        hasValidUserId
          ? this.usersService.findOne({
              _id: userId,
              isDeleted: false,
            })
          : null,
        hasValidOrganizationId
          ? this.organizationSettingsService.findOne({
              isDeleted: false,
              organization: organizationId,
            })
          : null,
        organizationId
          ? this.creditsUtilsService.getOrganizationCreditsBalance(
              organizationId,
            )
          : 0,
        hasValidUserId && hasValidOrganizationId
          ? this.getAccessibleBrands(organizationId, userId, isSuperAdmin)
          : [],
      ]);

    const matchedBrand = brands.find(
      (candidate) => getBrandId(candidate) === brandId,
    );
    const resolvedBrandId = brandId
      ? getBrandId(matchedBrand) || getBrandId(brands[0]) || brandId
      : '';

    return {
      access: {
        brandId: resolvedBrandId,
        creditsBalance,
        hasEverHadCredits: organizationSettings?.hasEverHadCredits === true,
        isOnboardingCompleted: dbUser?.isOnboardingCompleted === true,
        isSuperAdmin,
        organizationId,
        subscriptionStatus,
        subscriptionTier:
          organizationSettings?.subscriptionTier ?? subscriptionTier,
        userId,
      },
      brands: toPlainJson(brands) as unknown as IBrand[],
      currentUser: this.serializeRecord(
        dbUser,
      ) as AccessBootstrapCachePayload['currentUser'],
      settings: this.serializeRecord(
        organizationSettings,
      ) as AccessBootstrapCachePayload['settings'],
    };
  }

  async getBootstrap(
    request: AuthBootstrapRequest,
  ): Promise<AccessBootstrapCachePayload> {
    const base = await this.resolveBootstrapBase(request);
    const clerkUserId = request.user?.id ?? '';
    const organizationId = base.access.organizationId;

    if (base.cachedPayload) {
      return base.cachedPayload;
    }

    const hasValidOrganizationId = true;
    const selectedBrand = base.brands.find(
      (candidate) => getBrandId(candidate) === base.access.brandId,
    );

    const [darkroomCapabilities, streak] = await Promise.all([
      hasValidOrganizationId && base.access.brandId && selectedBrand
        ? this.buildDarkroomCapabilities(
            organizationId,
            base.access.brandId,
            Boolean(selectedBrand.isDarkroomEnabled),
          )
        : Promise.resolve(null),
      hasValidOrganizationId && base.access.userId
        ? this.streaksService.getStreakSummary(
            base.access.userId,
            organizationId,
          )
        : Promise.resolve(null),
    ]);

    const payload: AccessBootstrapCachePayload = {
      access: base.access,
      brands: base.brands,
      currentUser: base.currentUser,
      darkroomCapabilities,
      settings: base.settings,
      streak,
    };

    if (clerkUserId && organizationId) {
      await this.accessBootstrapCacheService.set(
        clerkUserId,
        organizationId,
        payload,
      );
    }

    return payload;
  }

  async getOverviewBootstrap(
    request: AuthBootstrapRequest,
  ): Promise<OverviewBootstrapPayload> {
    const requestCacheKey = this.getOverviewBootstrapRequestCacheKey(request);
    if (requestCacheKey) {
      const cached = this.getCachedOverviewBootstrap(requestCacheKey);
      if (cached) {
        return cached;
      }
    }

    const bootstrap = await this.resolveBootstrapBase(request);
    const organizationId = bootstrap.access.organizationId;
    const brandId = bootstrap.access.brandId || undefined;

    if (!organizationId || typeof organizationId !== 'string') {
      return {
        activeRuns: [],
        analytics: {},
        reviewInbox: {
          approvedCount: 0,
          changesRequestedCount: 0,
          pendingCount: 0,
          readyCount: 0,
          recentItems: [],
          rejectedCount: 0,
        },
        runs: [],
        stats: null,
        timeSeries: [],
      };
    }

    const cacheKey =
      requestCacheKey ?? this.getOverviewBootstrapCacheKey(bootstrap.access);
    const cached = this.getCachedOverviewBootstrap(cacheKey);
    if (cached) {
      return cached;
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 13);

    const startDateIso = startDate.toISOString().split('T')[0] ?? '';
    const endDateIso = endDate.toISOString().split('T')[0] ?? '';

    const [
      analyticsMetrics,
      totalCredentialsConnected,
      reviewInbox,
      timeSeries,
      runs,
      activeRuns,
      stats,
    ] = await Promise.all([
      this.analyticsAggregationService.getOverviewMetrics(
        organizationId,
        brandId,
        startDateIso,
        endDateIso,
      ),
      this.credentialsService.countConnected(organizationId, brandId),
      this.batchGenerationService.getReviewInboxSummary(
        organizationId,
        brandId || undefined,
        5,
      ),
      this.analyticsAggregationService.getTimeSeriesDataWithPlatforms(
        organizationId,
        brandId,
        startDateIso,
        endDateIso,
        'day',
      ),
      this.agentRunsService.listRecentRuns(organizationId, 20),
      this.agentRunsService.getActiveRuns(organizationId),
      this.agentRunsService.getStats(organizationId),
    ]);

    const payload: OverviewBootstrapPayload = {
      activeRuns: toPlainJson(activeRuns),
      analytics: {
        ...analyticsMetrics,
        totalCredentialsConnected,
      },
      reviewInbox: toPlainJson(reviewInbox),
      runs: toPlainJson(runs),
      stats,
      timeSeries: toPlainJson(timeSeries),
    };

    this.setCachedOverviewBootstrap(cacheKey, payload);
    const resolvedCacheKey = this.getOverviewBootstrapCacheKey(
      bootstrap.access,
    );
    if (resolvedCacheKey !== cacheKey) {
      this.setCachedOverviewBootstrap(resolvedCacheKey, payload);
    }

    return payload;
  }
}
