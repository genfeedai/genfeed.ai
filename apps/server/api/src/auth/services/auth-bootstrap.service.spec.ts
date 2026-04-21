import { AuthBootstrapService } from '@api/auth/services/auth-bootstrap.service';
import type { AccessBootstrapCachePayload } from '@api/common/services/access-bootstrap-cache.service';
import { SubscriptionStatus, SubscriptionTier } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetIsSuperAdmin,
  mockGetPublicMetadata,
  mockGetStripeSubscriptionStatus,
  mockGetSubscriptionTier,
} = vi.hoisted(() => ({
  mockGetIsSuperAdmin: vi.fn(),
  mockGetPublicMetadata: vi.fn(),
  mockGetStripeSubscriptionStatus: vi.fn(),
  mockGetSubscriptionTier: vi.fn(),
}));

vi.mock('@genfeedai/enums', () => ({
  SubscriptionStatus: {
    ACTIVE: 'active',
    CANCELED: 'canceled',
    PAST_DUE: 'past_due',
    TRIALING: 'trialing',
  },
  SubscriptionTier: {
    BYOK: 'byok',
    CREATOR: 'creator',
    ENTERPRISE: 'enterprise',
    FREE: 'free',
    PRO: 'pro',
    SCALE: 'scale',
  },
}));

vi.mock('@api/collections/agent-runs/services/agent-runs.service', () => ({
  AgentRunsService: class AgentRunsService {},
}));

vi.mock('@api/collections/brands/services/brands.service', () => ({
  BrandsService: class BrandsService {},
}));

vi.mock('@api/collections/credentials/services/credentials.service', () => ({
  CredentialsService: class CredentialsService {},
}));

vi.mock('@api/collections/credits/services/credits.utils.service', () => ({
  CreditsUtilsService: class CreditsUtilsService {},
}));

vi.mock('@api/collections/members/services/members.service', () => ({
  MembersService: class MembersService {},
}));

vi.mock(
  '@api/collections/organization-settings/services/organization-settings.service',
  () => ({
    OrganizationSettingsService: class OrganizationSettingsService {},
  }),
);

vi.mock(
  '@api/collections/posts/services/analytics-aggregation.service',
  () => ({
    AnalyticsAggregationService: class AnalyticsAggregationService {},
  }),
);

vi.mock('@api/collections/streaks/services/streaks.service', () => ({
  StreaksService: class StreaksService {},
}));

vi.mock('@api/collections/users/services/users.service', () => ({
  UsersService: class UsersService {},
}));

vi.mock('@api/common/services/access-bootstrap-cache.service', () => ({
  AccessBootstrapCacheService: class AccessBootstrapCacheService {},
}));

vi.mock('@api/config/config.service', () => ({
  ConfigService: class ConfigService {},
}));

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getIsSuperAdmin: mockGetIsSuperAdmin,
  getPublicMetadata: mockGetPublicMetadata,
  getStripeSubscriptionStatus: mockGetStripeSubscriptionStatus,
  getSubscriptionTier: mockGetSubscriptionTier,
}));

vi.mock('@api/services/batch-generation/batch-generation.service', () => ({
  BatchGenerationService: class BatchGenerationService {},
}));

vi.mock('@api/services/integrations/fleet/fleet.service', () => ({
  FleetService: class FleetService {},
}));

vi.mock('@serializers/helpers/plain-json.helper', () => ({
  toPlainJson: (value: unknown) => value,
}));

describe('AuthBootstrapService', () => {
  const accessBootstrapCacheService = {
    get: vi.fn(),
    set: vi.fn(),
  };
  const agentRunsService = {
    getActiveRuns: vi.fn(),
    getStats: vi.fn(),
    listRecentRuns: vi.fn(),
  };
  const analyticsAggregationService = {
    getOverviewMetrics: vi.fn(),
    getTimeSeriesDataWithPlatforms: vi.fn(),
  };
  const brandsService = {
    findForOrganization: vi.fn(),
  };
  const configService = {
    get: vi.fn(),
  };
  const creditsUtilsService = {
    getOrganizationCreditsBalance: vi.fn(),
  };
  const credentialsService = {
    findAll: vi.fn(),
  };
  const batchGenerationService = {
    getReviewInboxSummary: vi.fn(),
  };
  const fleetService = {
    isAvailable: vi.fn(),
  };
  const membersService = {
    findOne: vi.fn(),
  };
  const organizationSettingsService = {
    findOne: vi.fn(),
  };
  const streaksService = {
    getStreakSummary: vi.fn(),
  };
  const usersService = {
    findOne: vi.fn(),
  };

  let service: AuthBootstrapService;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new AuthBootstrapService(
      accessBootstrapCacheService as never,
      agentRunsService as never,
      analyticsAggregationService as never,
      brandsService as never,
      configService as never,
      creditsUtilsService as never,
      credentialsService as never,
      batchGenerationService as never,
      fleetService as never,
      membersService as never,
      organizationSettingsService as never,
      streaksService as never,
      usersService as never,
    );

    accessBootstrapCacheService.get.mockResolvedValue(null);
    accessBootstrapCacheService.set.mockResolvedValue(undefined);
    agentRunsService.getActiveRuns.mockResolvedValue([]);
    agentRunsService.getStats.mockResolvedValue(null);
    agentRunsService.listRecentRuns.mockResolvedValue([]);
    analyticsAggregationService.getOverviewMetrics.mockResolvedValue({
      totalPosts: 12,
    });
    analyticsAggregationService.getTimeSeriesDataWithPlatforms.mockResolvedValue(
      [],
    );
    brandsService.findForOrganization.mockResolvedValue([]);
    configService.get.mockReturnValue('');
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(0);
    credentialsService.findAll.mockResolvedValue({ docs: [] });
    batchGenerationService.getReviewInboxSummary.mockResolvedValue({
      approvedCount: 1,
      changesRequestedCount: 0,
      pendingCount: 2,
      readyCount: 3,
      recentItems: [
        {
          batchId: 'batch-1',
          createdAt: '2026-03-25T10:00:00.000Z',
          format: 'image',
          id: 'item-1',
          mediaUrl: 'https://cdn.example.com/image.png',
          platform: 'instagram',
          postId: 'post-1',
          reviewDecision: undefined,
          status: 'completed',
          summary: 'Autopilot image review',
        },
      ],
      rejectedCount: 0,
    });
    fleetService.isAvailable.mockResolvedValue(true);
    membersService.findOne.mockResolvedValue(null);
    organizationSettingsService.findOne.mockResolvedValue(null);
    streaksService.getStreakSummary.mockResolvedValue(null);
    usersService.findOne.mockResolvedValue(null);

    mockGetIsSuperAdmin.mockReturnValue(false);
    mockGetPublicMetadata.mockImplementation(
      (user: { publicMetadata?: Record<string, unknown> } | null) =>
        user?.publicMetadata ?? {},
    );
    mockGetStripeSubscriptionStatus.mockReturnValue('');
    mockGetSubscriptionTier.mockReturnValue('');
  });

  it('returns the expanded cached bootstrap payload when present', async () => {
    const cached: AccessBootstrapCachePayload = {
      access: {
        brandId: 'brand_1',
        creditsBalance: 42,
        hasEverHadCredits: true,
        isOnboardingCompleted: true,
        isSuperAdmin: false,
        organizationId: 'org_1',
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionTier: SubscriptionTier.BYOK,
        userId: 'user_1',
      },
      brands: [{ id: 'brand_1', label: 'Alpha' }] as never,
      currentUser: { id: 'user_1' } as never,
      darkroomCapabilities: null,
      settings: null,
      streak: null,
    };
    accessBootstrapCacheService.get.mockResolvedValue(cached);

    const result = await service.getBootstrap({
      context: { organizationId: 'org_1', userId: 'user_1' },
      user: {
        id: 'clerk_1',
        publicMetadata: { brand: 'brand_1' },
      },
    } as never);

    expect(result).toEqual(cached);
    expect(usersService.findOne).not.toHaveBeenCalled();
    expect(accessBootstrapCacheService.set).not.toHaveBeenCalled();
  });

  it('builds a nested shell bootstrap payload from authoritative services', async () => {
    const userId = 'test-object-id';
    const organizationId = 'test-object-id';
    const brandId = 'test-object-id';

    usersService.findOne.mockResolvedValue({
      isOnboardingCompleted: true,
      settings: {
        dashboardPreferences: {
          scopes: {
            organization: {
              blocks: [],
              isAgentModified: false,
              updatedAt: '2026-03-25T10:00:00.000Z',
              version: 1,
            },
          },
        },
      },
      toObject: () => ({
        id: userId,
        isOnboardingCompleted: true,
        settings: {
          dashboardPreferences: {
            scopes: {
              organization: {
                blocks: [],
                isAgentModified: false,
                updatedAt: '2026-03-25T10:00:00.000Z',
                version: 1,
              },
            },
          },
        },
      }),
    });
    organizationSettingsService.findOne.mockResolvedValue({
      hasEverHadCredits: true,
      subscriptionTier: SubscriptionTier.PRO,
      toObject: () => ({
        enabledModels: ['model_1'],
        organization: organizationId,
      }),
    });
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(125);
    brandsService.findForOrganization.mockResolvedValue([
      {
        _id: brandId,
        id: brandId,
        isDarkroomEnabled: true,
        label: 'Primary Brand',
      },
    ]);
    streaksService.getStreakSummary.mockResolvedValue({
      currentStreak: 7,
    });

    const result = await service.getBootstrap({
      context: {
        brandId,
        isSuperAdmin: false,
        organizationId,
        stripeSubscriptionStatus: SubscriptionStatus.TRIALING,
        subscriptionTier: '',
        userId,
      },
      user: {
        id: 'clerk_2',
        publicMetadata: {
          brand: brandId,
          organization: organizationId,
          user: userId,
        },
      },
    } as never);

    expect(result).toEqual({
      access: {
        brandId,
        creditsBalance: 125,
        hasEverHadCredits: true,
        isOnboardingCompleted: true,
        isSuperAdmin: false,
        organizationId,
        subscriptionStatus: SubscriptionStatus.TRIALING,
        subscriptionTier: SubscriptionTier.PRO,
        userId,
      },
      brands: [
        expect.objectContaining({
          id: brandId,
          label: 'Primary Brand',
        }),
      ],
      currentUser: expect.objectContaining({
        id: userId,
        isOnboardingCompleted: true,
        settings: expect.objectContaining({
          dashboardPreferences: expect.objectContaining({
            scopes: expect.objectContaining({
              organization: expect.objectContaining({
                blocks: [],
                isAgentModified: false,
                version: 1,
              }),
            }),
          }),
        }),
      }),
      darkroomCapabilities: expect.objectContaining({
        brandEnabled: true,
        brandId,
        organizationId,
      }),
      settings: expect.objectContaining({
        enabledModels: ['model_1'],
        organization: organizationId,
      }),
      streak: {
        currentStreak: 7,
      },
    });
    expect(fleetService.isAvailable).toHaveBeenCalledTimes(3);
    expect(usersService.findOne).toHaveBeenCalledWith({
      _id: expect.any(String),
      isDeleted: false,
    });
    expect(accessBootstrapCacheService.set).toHaveBeenCalledWith(
      'clerk_2',
      organizationId,
      result,
    );
  });

  it('serializes Prisma-style plain objects without requiring toObject()', async () => {
    const userId = 'test-object-id';
    const organizationId = 'test-object-id';
    const brandId = 'test-object-id';

    usersService.findOne.mockResolvedValue({
      id: userId,
      isOnboardingCompleted: true,
      settings: { locale: 'en' },
    });
    organizationSettingsService.findOne.mockResolvedValue({
      enabledModels: ['model_1'],
      hasEverHadCredits: false,
      organization: organizationId,
      subscriptionTier: SubscriptionTier.PRO,
    });
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(10);
    brandsService.findForOrganization.mockResolvedValue([
      {
        _id: brandId,
        id: brandId,
        isDarkroomEnabled: false,
        label: 'Primary Brand',
      },
    ]);

    const result = await service.getBootstrap({
      context: {
        brandId,
        isSuperAdmin: false,
        organizationId,
        stripeSubscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionTier: '',
        userId,
      },
      user: {
        id: 'clerk_plain',
        publicMetadata: {
          brand: brandId,
          organization: organizationId,
          user: userId,
        },
      },
    } as never);

    expect(result.currentUser).toEqual(
      expect.objectContaining({
        id: userId,
        isOnboardingCompleted: true,
        settings: { locale: 'en' },
      }),
    );
    expect(result.settings).toEqual(
      expect.objectContaining({
        enabledModels: ['model_1'],
        organization: organizationId,
      }),
    );
  });

  it('keeps member brand scoping when the user is not a super admin', async () => {
    const userId = 'test-object-id';
    const organizationId = 'test-object-id';
    const restrictedBrandId = 'test-object-id';

    membersService.findOne.mockResolvedValue({
      brands: [restrictedBrandId],
    });

    await service.getBootstrap({
      context: {
        isSuperAdmin: false,
        organizationId,
        userId,
      },
      user: {
        id: 'clerk_3',
        publicMetadata: {
          organization: organizationId,
          user: userId,
        },
      },
    } as never);

    expect(brandsService.findForOrganization).toHaveBeenCalledWith(
      organizationId,
      {
        brandIds: [restrictedBrandId],
      },
    );
  });

  it('preserves an intentionally cleared brand selection', async () => {
    const userId = 'test-object-id';
    const organizationId = 'test-object-id';
    const brandId = 'test-object-id';

    brandsService.findForOrganization.mockResolvedValue([
      {
        _id: brandId,
        id: brandId,
        isDarkroomEnabled: true,
        label: 'Primary Brand',
      },
    ]);

    const result = await service.getBootstrap({
      context: {
        brandId: '',
        isSuperAdmin: false,
        organizationId,
        stripeSubscriptionStatus: '',
        subscriptionTier: '',
        userId,
      },
      user: {
        id: 'clerk_4',
        publicMetadata: {
          brand: '',
          organization: organizationId,
          user: userId,
        },
      },
    } as never);

    expect(result.access.brandId).toBe('');
    expect(result.darkroomCapabilities).toBeNull();
  });

  it('aggregates overview data through the single overview bootstrap path', async () => {
    const organizationId = 'test-object-id';
    const brandId = 'test-object-id';
    const userId = 'test-object-id';
    const bootstrapPayload: AccessBootstrapCachePayload = {
      access: {
        brandId,
        creditsBalance: 0,
        hasEverHadCredits: false,
        isOnboardingCompleted: true,
        isSuperAdmin: false,
        organizationId,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionTier: SubscriptionTier.PRO,
        userId: 'test-object-id',
      },
      brands: [],
      currentUser: null,
      darkroomCapabilities: null,
      settings: null,
      streak: null,
    };
    accessBootstrapCacheService.get.mockResolvedValue(bootstrapPayload);
    const getBootstrapSpy = vi
      .spyOn(service, 'getBootstrap')
      .mockResolvedValue(bootstrapPayload);

    agentRunsService.listRecentRuns.mockResolvedValue([{ id: 'run_1' }]);
    agentRunsService.getActiveRuns.mockResolvedValue([{ id: 'run_2' }]);
    agentRunsService.getStats.mockResolvedValue({
      activeRuns: 1,
      anomalies: [],
      autoRoutedRuns: 1,
      completedToday: 2,
      failedToday: 0,
      routingPaths: [],
      timeRange: '7d',
      topActualModels: [{ count: 1, model: 'google/gemini-2.5-flash' }],
      topRequestedModels: [{ count: 1, model: 'openrouter/auto' }],
      totalCreditsToday: 15,
      totalRuns: 10,
      trends: [],
      webEnabledRuns: 1,
    });
    analyticsAggregationService.getOverviewMetrics.mockResolvedValue({
      totalPosts: 12,
    });
    analyticsAggregationService.getTimeSeriesDataWithPlatforms.mockResolvedValue(
      [{ date: '2026-03-17', instagram: 10 }],
    );
    credentialsService.findAll.mockResolvedValue({
      docs: [{ total: 3 }],
    });

    const result = await service.getOverviewBootstrap({
      context: {
        brandId,
        organizationId,
        userId,
      },
      user: {
        id: 'clerk_4',
        publicMetadata: {
          brand: brandId,
          organization: organizationId,
          user: userId,
        },
      },
    } as never);

    expect(getBootstrapSpy).not.toHaveBeenCalled();
    expect(usersService.findOne).not.toHaveBeenCalled();
    expect(analyticsAggregationService.getOverviewMetrics).toHaveBeenCalledWith(
      organizationId,
      brandId,
      expect.any(String),
      expect.any(String),
    );
    expect(agentRunsService.listRecentRuns).toHaveBeenCalledWith(
      organizationId,
      20,
    );
    expect(batchGenerationService.getReviewInboxSummary).toHaveBeenCalledWith(
      organizationId,
      brandId,
      5,
    );
    expect(result).toEqual({
      activeRuns: [{ id: 'run_2' }],
      analytics: {
        totalCredentialsConnected: 3,
        totalPosts: 12,
      },
      reviewInbox: {
        approvedCount: 1,
        changesRequestedCount: 0,
        pendingCount: 2,
        readyCount: 3,
        recentItems: [
          {
            batchId: 'batch-1',
            createdAt: '2026-03-25T10:00:00.000Z',
            format: 'image',
            id: 'item-1',
            mediaUrl: 'https://cdn.example.com/image.png',
            platform: 'instagram',
            postId: 'post-1',
            reviewDecision: undefined,
            status: 'completed',
            summary: 'Autopilot image review',
          },
        ],
        rejectedCount: 0,
      },
      runs: [{ id: 'run_1' }],
      stats: {
        activeRuns: 1,
        anomalies: [],
        autoRoutedRuns: 1,
        completedToday: 2,
        failedToday: 0,
        routingPaths: [],
        timeRange: '7d',
        topActualModels: [{ count: 1, model: 'google/gemini-2.5-flash' }],
        topRequestedModels: [{ count: 1, model: 'openrouter/auto' }],
        totalCreditsToday: 15,
        totalRuns: 10,
        trends: [],
        webEnabledRuns: 1,
      },
      timeSeries: [{ date: '2026-03-17', instagram: 10 }],
    });
  });
});
