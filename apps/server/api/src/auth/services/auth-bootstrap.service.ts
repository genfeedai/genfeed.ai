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
import { Types } from 'mongoose';

export interface AuthBootstrapRequest extends RequestWithContext {}

export interface OverviewBootstrapPayload {
  activeRuns: unknown[];
  analytics: Partial<IAnalytics>;
  reviewInbox: ReviewInboxSummary;
  runs: unknown[];
  stats: AgentRunStats | null;
  timeSeries: unknown[];
}

type BootstrapBaseData = Pick<
  AccessBootstrapCachePayload,
  'access' | 'brands' | 'currentUser' | 'settings'
> & {
  cachedPayload?: AccessBootstrapCachePayload;
};

@Injectable()
export class AuthBootstrapService {
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
    let restrictedBrandIds: string[] | undefined;

    const member = await this.membersService.findOne({
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      user: new Types.ObjectId(userId),
    });

    if (
      !isSuperAdmin &&
      Array.isArray(member?.brands) &&
      member.brands.length > 0
    ) {
      restrictedBrandIds = member.brands.map((brandId) => String(brandId));
    }

    return await this.brandsService.findForOrganization(organizationId, {
      brandIds: restrictedBrandIds,
    });
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

    const hasValidUserId = Types.ObjectId.isValid(userId);
    const hasValidOrganizationId = Types.ObjectId.isValid(organizationId);
    const isSuperAdmin = user ? getIsSuperAdmin(user, request) : false;

    const [dbUser, organizationSettings, creditsBalance, brands] =
      await Promise.all([
        hasValidUserId
          ? this.usersService.findOne({
              _id: new Types.ObjectId(userId),
              isDeleted: false,
            })
          : null,
        hasValidOrganizationId
          ? this.organizationSettingsService.findOne({
              isDeleted: false,
              organization: new Types.ObjectId(organizationId),
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
      (candidate) => String(candidate._id) === brandId,
    );
    const resolvedBrandId =
      matchedBrand?._id?.toString() ?? brands[0]?._id?.toString() ?? brandId;

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
      currentUser: dbUser ? toPlainJson(dbUser.toObject()) : null,
      settings: organizationSettings
        ? toPlainJson(organizationSettings.toObject())
        : null,
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

    const hasValidOrganizationId = Types.ObjectId.isValid(organizationId);
    const selectedBrand = base.brands.find(
      (candidate) => String(candidate._id) === base.access.brandId,
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
    const bootstrap = await this.resolveBootstrapBase(request);
    const organizationId = bootstrap.access.organizationId;
    const brandId = bootstrap.access.brandId || undefined;

    if (!Types.ObjectId.isValid(organizationId)) {
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
      this.credentialsService.findAll(
        [
          {
            $match: {
              isConnected: true,
              isDeleted: false,
              organization: new Types.ObjectId(organizationId),
              ...(brandId ? { brand: new Types.ObjectId(brandId) } : {}),
            },
          },
          { $count: 'total' },
        ],
        { pagination: false },
      ),
      this.batchGenerationService.getReviewInboxSummary(
        organizationId,
        Types.ObjectId.isValid(brandId ?? '') ? brandId : undefined,
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

    return {
      activeRuns: toPlainJson(activeRuns),
      analytics: {
        ...analyticsMetrics,
        totalCredentialsConnected:
          (totalCredentialsConnected.docs[0] as { total?: number } | undefined)
            ?.total ?? 0,
      },
      reviewInbox: toPlainJson(reviewInbox),
      runs: toPlainJson(runs),
      stats,
      timeSeries: toPlainJson(timeSeries),
    };
  }
}
