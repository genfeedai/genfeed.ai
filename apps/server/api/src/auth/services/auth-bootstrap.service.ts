import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import { UsersService } from '@api/collections/users/services/users.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import {
  type AccessBootstrapCachePayload,
  AccessBootstrapCacheService,
} from '@api/common/services/access-bootstrap-cache.service';
import {
  getIsSuperAdmin,
  getStripeSubscriptionStatus,
  getSubscriptionTier,
} from '@api/helpers/utils/auth/auth.util';
import {
  BatchGenerationService,
  ReviewInboxSummary,
} from '@api/services/batch-generation/batch-generation.service';
import type { IAnalytics, IBrand } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';
import { toPlainJson } from '@serializers/helpers/plain-json.helper';

export interface AuthBootstrapRequest extends RequestWithContext {}

export interface OverviewBootstrapPayload {
  analytics: Partial<IAnalytics>;
  reviewInbox: ReviewInboxSummary;
  timeSeries: unknown[];
}

function getBrandId(record: { id?: unknown } | null | undefined): string {
  return typeof record?.id === 'string' ? record.id : '';
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
    private readonly brandsService: BrandsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly batchGenerationService: BatchGenerationService,
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
    const user = request.user;
    const organizationId =
      request.context?.organizationId ?? user?.organizationId ?? '';

    if (!organizationId) {
      return null;
    }

    const brandId = request.context?.brandId ?? user?.brandId ?? '';
    const userId = request.context?.userId ?? user?.userId ?? user?.id ?? '';

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

  private async getAccessibleBrands(
    organizationId: string,
    userId: string,
    isSuperAdmin: boolean,
  ) {
    if (!isSuperAdmin) {
      await this.membersService.findOne({
        organizationId: organizationId,
        userId: userId,
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
    const requestContext = request.context;
    const userId = requestContext?.userId ?? user?.userId ?? user?.id ?? '';
    const organizationId =
      requestContext?.organizationId ?? user?.organizationId ?? '';
    const brandId = requestContext?.brandId ?? user?.brandId ?? '';
    const subscriptionStatus =
      requestContext?.stripeSubscriptionStatus ??
      (user ? getStripeSubscriptionStatus(user, request) : '');
    const subscriptionTier =
      requestContext?.subscriptionTier ??
      (user ? getSubscriptionTier(user, request) : '');

    if (userId && organizationId) {
      const cached = await this.accessBootstrapCacheService.get(
        userId,
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

    const hasValidUserId = Boolean(userId);
    const hasValidOrganizationId = Boolean(organizationId);
    const isSuperAdmin = user ? getIsSuperAdmin(user, request) : false;

    const [dbUser, organizationSettings, creditsBalance, brands] =
      await Promise.all([
        hasValidUserId
          ? this.usersService.findOne(
              {
                id: userId,
              },
              [],
            )
          : null,
        hasValidOrganizationId
          ? this.organizationSettingsService.findOne({
              organizationId: organizationId,
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
        hasDismissedAssetGate: dbUser?.hasDismissedAssetGate === true,
        hasEverHadCredits: organizationSettings?.hasEverHadCredits === true,
        hasGeneratedFirstAsset:
          organizationSettings?.hasGeneratedFirstAsset === true,
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
    // Streak only needs ids already on the request — fetch it in parallel with
    // the base bootstrap resolve so a cold miss is one network hop, not two.
    const user = request.user;
    const requestUserId =
      request.context?.userId ?? user?.userId ?? user?.id ?? '';
    const requestOrganizationId =
      request.context?.organizationId ?? user?.organizationId ?? '';

    const [base, streak] = await Promise.all([
      this.resolveBootstrapBase(request),
      requestUserId && requestOrganizationId
        ? this.streaksService.getStreakSummary(
            requestUserId,
            requestOrganizationId,
          )
        : Promise.resolve(null),
    ]);

    const userId = base.access.userId;
    const organizationId = base.access.organizationId;

    if (base.cachedPayload) {
      return {
        ...base.cachedPayload,
        fleetCapabilities: null,
      };
    }

    const payload: AccessBootstrapCachePayload = {
      access: base.access,
      brands: base.brands,
      currentUser: base.currentUser,
      fleetCapabilities: null,
      settings: base.settings,
      streak,
    };

    if (userId && organizationId) {
      await this.accessBootstrapCacheService.set(
        userId,
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
        analytics: {},
        reviewInbox: {
          approvedCount: 0,
          changesRequestedCount: 0,
          pendingCount: 0,
          readyCount: 0,
          recentItems: [],
          rejectedCount: 0,
        },
        timeSeries: [],
      };
    }

    const cacheKey =
      requestCacheKey ?? this.getOverviewBootstrapCacheKey(bootstrap.access);
    const cached = this.getCachedOverviewBootstrap(cacheKey);
    if (cached) {
      return cached;
    }

    const reviewInbox = await this.batchGenerationService.getReviewInboxSummary(
      organizationId,
      brandId || undefined,
      5,
    );

    const payload: OverviewBootstrapPayload = {
      analytics: {},
      reviewInbox: toPlainJson(reviewInbox),
      timeSeries: [],
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
