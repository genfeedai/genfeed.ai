import { AuthBootstrapService } from '@api/auth/services/auth-bootstrap.service';
import type { AccessBootstrapCachePayload } from '@api/common/services/access-bootstrap-cache.service';
import {
  MemberRole,
  SubscriptionStatus,
  SubscriptionTier,
} from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetIsSuperAdmin,
  mockGetStripeSubscriptionStatus,
  mockGetSubscriptionTier,
} = vi.hoisted(() => ({
  mockGetIsSuperAdmin: vi.fn(),
  mockGetStripeSubscriptionStatus: vi.fn(),
  mockGetSubscriptionTier: vi.fn(),
}));

vi.mock('@genfeedai/contracts', () => ({
  MemberRole: {
    ADMIN: 'admin',
    ANALYTICS: 'analytics',
    CREATOR: 'creator',
    OWNER: 'owner',
    SUPPORT: 'support',
    USER: 'user',
  },
  SubscriptionStatus: {
    ACTIVE: 'ACTIVE',
    CANCELLED: 'CANCELLED',
    PAST_DUE: 'PAST_DUE',
    TRIALING: 'TRIALING',
  },
  SubscriptionTier: {
    BYOK: 'byok',
    CREATOR: 'creator',
    ENTERPRISE: 'enterprise',
    FREE: 'free',
    PRO: 'pro',
    SCALE: 'scale',
  },
  subscriptionStatusFromStripe: (status: string | null | undefined) => {
    const normalized = String(status ?? '')
      .replace(/-/g, '_')
      .toUpperCase();
    if (normalized === 'CANCELED' || normalized === 'CANCELLED') {
      return 'CANCELLED';
    }
    return normalized || 'INCOMPLETE';
  },
}));

vi.mock('@api/collections/brands/services/brands.service', () => ({
  BrandsService: class BrandsService {},
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

vi.mock('@api/collections/streaks/services/streaks.service', () => ({
  StreaksService: class StreaksService {},
}));

vi.mock('@api/collections/users/services/users.service', () => ({
  UsersService: class UsersService {},
}));

vi.mock('@api/common/services/access-bootstrap-cache.service', () => ({
  AccessBootstrapCacheService: class AccessBootstrapCacheService {},
}));

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getIsSuperAdmin: mockGetIsSuperAdmin,
  getStripeSubscriptionStatus: mockGetStripeSubscriptionStatus,
  getSubscriptionTier: mockGetSubscriptionTier,
}));

vi.mock('@api/services/batch-generation/batch-generation.service', () => ({
  BatchGenerationService: class BatchGenerationService {},
}));

vi.mock('@api/collections/credits/services/free-trial.service', () => ({
  FreeTrialService: class FreeTrialService {},
}));

vi.mock(
  '@api/services/low-credit-threshold/low-credit-threshold.service',
  () => ({
    LowCreditThresholdService: class LowCreditThresholdService {},
  }),
);

vi.mock(
  '@api/services/router/default-generation-affordability.service',
  () => ({
    DefaultGenerationAffordabilityService: class DefaultGenerationAffordabilityService {},
  }),
);

vi.mock('@serializers/helpers/plain-json.helper', () => ({
  toPlainJson: (value: unknown) => value,
}));

describe('AuthBootstrapService', () => {
  const accessBootstrapCacheService = {
    get: vi.fn(),
    set: vi.fn(),
  };
  const brandsService = {
    findForOrganization: vi.fn(),
  };
  const creditsUtilsService = {
    getOrganizationCreditsBalance: vi.fn(),
  };
  const batchGenerationService = {
    getReviewInboxSummary: vi.fn(),
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
  const defaultGenerationAffordability = {
    canAffordDefaultGeneration: vi.fn(),
  };
  const freeTrialService = {
    getState: vi.fn(),
  };
  const lowCreditThresholdService = {
    resolve: vi.fn(),
  };

  let service: AuthBootstrapService;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new AuthBootstrapService(
      accessBootstrapCacheService as never,
      brandsService as never,
      creditsUtilsService as never,
      batchGenerationService as never,
      membersService as never,
      organizationSettingsService as never,
      streaksService as never,
      usersService as never,
      defaultGenerationAffordability as never,
      freeTrialService as never,
      lowCreditThresholdService as never,
    );

    accessBootstrapCacheService.get.mockResolvedValue(null);
    accessBootstrapCacheService.set.mockResolvedValue(undefined);
    brandsService.findForOrganization.mockResolvedValue([]);
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(0);
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
          reviewDecision: 'unset',
          status: 'completed',
          summary: 'Autopilot image review',
        },
      ],
      rejectedCount: 0,
    });
    membersService.findOne.mockResolvedValue(null);
    organizationSettingsService.findOne.mockResolvedValue(null);
    streaksService.getStreakSummary.mockResolvedValue(null);
    usersService.findOne.mockResolvedValue(null);
    defaultGenerationAffordability.canAffordDefaultGeneration.mockResolvedValue(
      true,
    );
    freeTrialService.getState.mockResolvedValue({
      isTrialExpired: false,
      trialEndsAt: null,
    });
    lowCreditThresholdService.resolve.mockResolvedValue({
      isTrialSubject: false,
      threshold: null,
    });

    mockGetIsSuperAdmin.mockReturnValue(false);
    mockGetStripeSubscriptionStatus.mockReturnValue('');
    mockGetSubscriptionTier.mockReturnValue('');
  });

  it.each(Object.values(MemberRole))(
    'resolves %s from the active membership in the requested organization',
    async (role) => {
      membersService.findOne.mockImplementation(
        async (filter: Record<string, unknown>) =>
          filter.organizationId === 'org_active' &&
          filter.userId === 'user_1' &&
          filter.isActive === true &&
          filter.isDeleted === false
            ? { role: { key: role } }
            : null,
      );
      const result = await service.getBootstrap({
        context: { organizationId: 'org_active', userId: 'user_1' },
        user: { id: 'user_1' },
      } as never);
      expect(result.access.memberRole).toBe(role);
      expect(membersService.findOne).toHaveBeenCalledWith(
        {
          isActive: true,
          isDeleted: false,
          organizationId: 'org_active',
          userId: 'user_1',
        },
        expect.any(Array),
      );
    },
  );

  it.each([{ role: { key: 'unknown-role' } }, { role: null }, {}])(
    'returns no role for an invalid or missing populated role: %j',
    async (member) => {
      membersService.findOne.mockResolvedValue(member);

      const result = await service.getBootstrap({
        context: { organizationId: 'org_active', userId: 'user_1' },
        user: { id: 'user_1' },
      } as never);

      expect(result.access.memberRole).toBeNull();
    },
  );

  it('returns no role when only another organization has an active membership', async () => {
    membersService.findOne.mockImplementation(
      async (filter: Record<string, unknown>) =>
        filter.organizationId === 'org_other'
          ? { role: { key: 'owner' } }
          : null,
    );
    const result = await service.getBootstrap({
      context: { organizationId: 'org_active', userId: 'user_1' },
      user: { id: 'user_1', organizationId: 'org_other' },
    } as never);
    expect(result.access.memberRole).toBeNull();
    expect(membersService.findOne).not.toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_other' }),
      expect.anything(),
    );
  });

  it('returns no role and skips membership lookups without an organization', async () => {
    const result = await service.getBootstrap({
      context: { userId: 'user_1' },
      user: { id: 'user_1' },
    } as never);
    expect(result.access.memberRole).toBeNull();
    expect(membersService.findOne).not.toHaveBeenCalled();
  });

  it('returns the expanded cached bootstrap payload when present', async () => {
    const cached: AccessBootstrapCachePayload = {
      access: {
        brandId: 'brand_1',
        memberRole: null,
        hasDismissedAssetGate: false,
        hasGeneratedFirstAsset: false,
        creditsBalance: 42,
        hasEverHadCredits: true,
        isOnboardingCompleted: true,
        isSuperAdmin: false,
        organizationId: 'org_1',
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionTier: SubscriptionTier.PRO,
        userId: 'user_1',
      },
      brands: [{ id: 'brand_1', label: 'Alpha' }] as never,
      currentUser: { id: 'user_1' } as never,
      fleetCapabilities: null,
      settings: null,
      streak: null,
    };
    accessBootstrapCacheService.get.mockResolvedValue(cached);

    const result = await service.getBootstrap({
      context: { organizationId: 'org_1', userId: 'user_1' },
      user: {
        id: 'authProvider_1',
        brandId: 'brand_1',
      },
    } as never);

    expect(result).toEqual(cached);
    expect(usersService.findOne).not.toHaveBeenCalled();
    expect(accessBootstrapCacheService.set).not.toHaveBeenCalled();
  });

  it('judges super-admin on the current request, not the cached payload', async () => {
    const cached = {
      access: {
        brandId: 'brand_1',
        memberRole: null,
        hasDismissedAssetGate: false,
        hasGeneratedFirstAsset: false,
        creditsBalance: 0,
        hasEverHadCredits: false,
        isOnboardingCompleted: true,
        isSuperAdmin: true,
        organizationId: 'org_1',
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionTier: SubscriptionTier.PRO,
        userId: 'user_1',
      },
      brands: [],
      currentUser: { id: 'user_1' } as never,
      fleetCapabilities: null,
      settings: null,
      streak: null,
    } as unknown as AccessBootstrapCachePayload;
    accessBootstrapCacheService.get.mockResolvedValue(cached);
    mockGetIsSuperAdmin.mockReturnValue(false);

    const result = await service.getBootstrap({
      context: {
        isSuperAdmin: false,
        organizationId: 'org_1',
        userId: 'user_1',
      },
      user: { id: 'user_1', isSuperAdmin: false },
    } as never);

    expect(result.access.isSuperAdmin).toBe(false);
    expect(cached.access.isSuperAdmin).toBe(true);
  });

  it('normalizes stale cached bootstrap fleet capabilities', async () => {
    const cached: AccessBootstrapCachePayload = {
      access: {
        brandId: 'brand_1',
        memberRole: null,
        hasDismissedAssetGate: false,
        hasGeneratedFirstAsset: false,
        creditsBalance: 42,
        hasEverHadCredits: true,
        isOnboardingCompleted: true,
        isSuperAdmin: false,
        organizationId: 'org_1',
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionTier: SubscriptionTier.PRO,
        userId: 'user_1',
      },
      brands: [{ id: 'brand_1', label: 'Alpha' }] as never,
      currentUser: { id: 'user_1' } as never,
      fleetCapabilities: {
        brandEnabled: true,
        fleet: {
          images: true,
          llm: true,
          videos: true,
          voices: true,
        },
      },
      settings: null,
      streak: null,
    };
    accessBootstrapCacheService.get.mockResolvedValue(cached);

    const result = await service.getBootstrap({
      context: { organizationId: 'org_1', userId: 'user_1' },
      user: {
        id: 'authProvider_1',
        brandId: 'brand_1',
      },
    } as never);

    expect(result).toEqual({
      ...cached,
      fleetCapabilities: null,
    });
    expect(usersService.findOne).not.toHaveBeenCalled();
    expect(accessBootstrapCacheService.set).not.toHaveBeenCalled();
  });

  it('loads saved personal settings instead of restoring defaults on reload', async () => {
    const settings = {
      agentMode: 'auto',
      isAdvancedMode: false,
      theme: 'light',
    };
    usersService.findOne.mockImplementation(async (_params, populate) => ({
      id: 'user_1',
      ...(populate?.some(
        (relation: { path: string }) => relation.path === 'settings',
      )
        ? { settings }
        : {}),
    }));

    const result = await service.getBootstrap({
      user: { id: 'user_1', organizationId: 'org_1', userId: 'user_1' },
    } as never);

    expect(result.currentUser?.settings).toEqual(settings);
  });

  it.each([true, false])(
    'reports whether the wallet affords one default image (%s)',
    async (isAffordable) => {
      organizationSettingsService.findOne.mockResolvedValue({
        defaultImageModel: 'org-default-image-model',
      });
      creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(5);
      defaultGenerationAffordability.canAffordDefaultGeneration.mockResolvedValue(
        isAffordable,
      );

      const result = await service.getBootstrap({
        context: { organizationId: 'org_1', userId: 'user_1' },
        user: { id: 'user_1', organizationId: 'org_1', userId: 'user_1' },
      } as never);

      expect(result.access.canAffordDefaultGeneration).toBe(isAffordable);
      expect(
        defaultGenerationAffordability.canAffordDefaultGeneration,
      ).toHaveBeenCalledWith({
        balance: 5,
        organizationDefaultImageModel: 'org-default-image-model',
        organizationId: 'org_1',
      });
    },
  );

  it.each([
    [false, '2026-10-13T09:00:00.000Z'],
    [true, '2026-10-01T09:00:00.000Z'],
  ])(
    'exposes the free-trial window (expired: %s)',
    async (isTrialExpired, trialEndsAt) => {
      freeTrialService.getState.mockResolvedValue({
        isTrialExpired,
        trialEndsAt: new Date(trialEndsAt),
      });

      const result = await service.getBootstrap({
        context: { organizationId: 'org_1', userId: 'user_1' },
        user: { id: 'user_1', organizationId: 'org_1', userId: 'user_1' },
      } as never);

      expect(result.access.isTrialExpired).toBe(isTrialExpired);
      expect(result.access.trialEndsAt).toBe(trialEndsAt);
      expect(freeTrialService.getState).toHaveBeenCalledWith('org_1');
    },
  );

  it('carries the server-computed low-balance threshold for the banner', async () => {
    lowCreditThresholdService.resolve.mockResolvedValue({
      isTrialSubject: false,
      threshold: 590,
    });

    const result = await service.getBootstrap({
      context: { organizationId: 'org_1', userId: 'user_1' },
      user: { id: 'user_1', organizationId: 'org_1', userId: 'user_1' },
    } as never);

    expect(result.access.lowCreditThreshold).toBe(590);
    expect(lowCreditThresholdService.resolve).toHaveBeenCalledWith('org_1');
  });

  it('reports no trial window for an organization outside the trial', async () => {
    const result = await service.getBootstrap({
      context: { organizationId: 'org_1', userId: 'user_1' },
      user: { id: 'user_1', organizationId: 'org_1', userId: 'user_1' },
    } as never);

    expect(result.access.isTrialExpired).toBe(false);
    expect(result.access.trialEndsAt).toBeNull();
  });

  it('leaves affordability unknown without an organization', async () => {
    const result = await service.getBootstrap({
      context: { userId: 'user_1' },
      user: { id: 'user_1' },
    } as never);

    expect(result.access).not.toHaveProperty('canAffordDefaultGeneration');
    expect(result.access).not.toHaveProperty('trialEndsAt');
    expect(freeTrialService.getState).not.toHaveBeenCalled();
    expect(
      defaultGenerationAffordability.canAffordDefaultGeneration,
    ).not.toHaveBeenCalled();
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
        enabledModelIds: ['model_1'],
        organization: organizationId,
      }),
    });
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(125);
    brandsService.findForOrganization.mockResolvedValue([
      {
        id: brandId,
        isFleetEnabled: true,
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
        memberRole: null,
        organizationId,
        stripeSubscriptionStatus: SubscriptionStatus.TRIALING,
        subscriptionTier: '',
        userId,
      },
      user: {
        id: 'authProvider_2',
        brandId: brandId,
        organizationId: organizationId,
        userId: userId,
      },
    } as never);

    // Cold miss: streak is resolved from request ids alongside the base
    // bootstrap work (not sequenced after the full base resolve).
    expect(streaksService.getStreakSummary).toHaveBeenCalledWith(
      userId,
      organizationId,
    );
    expect(usersService.findOne).toHaveBeenCalled();

    expect(result).toEqual({
      access: {
        brandId,
        canAffordDefaultGeneration: true,
        creditsBalance: 125,
        hasDismissedAssetGate: false,
        hasEverHadCredits: true,
        hasGeneratedFirstAsset: false,
        isOnboardingCompleted: true,
        isSuperAdmin: false,
        isTrialExpired: false,
        lowCreditThreshold: null,
        memberRole: null,
        organizationId,
        subscriptionStatus: SubscriptionStatus.TRIALING,
        subscriptionTier: SubscriptionTier.PRO,
        trialEndsAt: null,
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
      fleetCapabilities: null,
      settings: expect.objectContaining({
        enabledModelIds: ['model_1'],
        organization: organizationId,
      }),
      streak: {
        currentStreak: 7,
      },
    });
    expect(usersService.findOne).toHaveBeenCalledWith(
      {
        id: userId,
      },
      [{ path: 'settings' }],
    );
    expect(accessBootstrapCacheService.set).toHaveBeenCalledWith(
      userId,
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
      enabledModelIds: ['model_1'],
      hasEverHadCredits: false,
      organization: organizationId,
      subscriptionTier: SubscriptionTier.PRO,
    });
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(10);
    brandsService.findForOrganization.mockResolvedValue([
      {
        id: brandId,
        isFleetEnabled: false,
        label: 'Primary Brand',
      },
    ]);

    const result = await service.getBootstrap({
      context: {
        brandId,
        isSuperAdmin: false,
        memberRole: null,
        organizationId,
        stripeSubscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionTier: '',
        userId,
      },
      user: {
        id: 'authProvider_plain',
        brandId: brandId,
        organizationId: organizationId,
        userId: userId,
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
        enabledModelIds: ['model_1'],
        organization: organizationId,
      }),
    );
  });

  it('loads organization brands for non-super-admin users without legacy member brand scoping', async () => {
    const userId = 'test-object-id';
    const organizationId = 'test-object-id';

    membersService.findOne.mockResolvedValue({
      currentBrandId: 'test-object-id',
    });

    await service.getBootstrap({
      context: {
        isSuperAdmin: false,
        memberRole: null,
        organizationId,
        userId,
      },
      user: {
        id: 'authProvider_3',
        organizationId: organizationId,
        userId: userId,
      },
    } as never);

    expect(brandsService.findForOrganization).toHaveBeenCalledWith(
      organizationId,
      {
        brandIds: undefined,
        includeCredentials: true,
      },
    );
  });

  it('preserves an intentionally cleared brand selection', async () => {
    const userId = 'test-object-id';
    const organizationId = 'test-object-id';
    const brandId = 'test-object-id';

    brandsService.findForOrganization.mockResolvedValue([
      {
        id: brandId,
        isFleetEnabled: true,
        label: 'Primary Brand',
      },
    ]);

    const result = await service.getBootstrap({
      context: {
        brandId: '',
        isSuperAdmin: false,
        memberRole: null,
        organizationId,
        stripeSubscriptionStatus: '',
        subscriptionTier: '',
        userId,
      },
      user: {
        id: 'authProvider_4',
        brandId: '',
        organizationId: organizationId,
        userId: userId,
      },
    } as never);

    expect(result.access.brandId).toBe('');
    expect(result.fleetCapabilities).toBeNull();
  });

  it('loads workspace overview data without unused analytics work', async () => {
    const organizationId = 'test-object-id';
    const brandId = 'test-object-id';
    const userId = 'test-object-id';
    const bootstrapPayload: AccessBootstrapCachePayload = {
      access: {
        brandId,
        hasGeneratedFirstAsset: false,
        hasDismissedAssetGate: false,
        creditsBalance: 0,
        hasEverHadCredits: false,
        isOnboardingCompleted: true,
        isSuperAdmin: false,
        memberRole: null,
        organizationId,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionTier: SubscriptionTier.PRO,
        userId: 'test-object-id',
      },
      brands: [],
      currentUser: null,
      fleetCapabilities: null,
      settings: null,
      streak: null,
    };
    accessBootstrapCacheService.get.mockResolvedValue(bootstrapPayload);
    const getBootstrapSpy = vi
      .spyOn(service, 'getBootstrap')
      .mockResolvedValue(bootstrapPayload);

    const result = await service.getOverviewBootstrap({
      context: {
        brandId,
        organizationId,
        userId,
      },
      user: {
        id: 'authProvider_4',
        brandId: brandId,
        organizationId: organizationId,
        userId: userId,
      },
    } as never);

    expect(getBootstrapSpy).not.toHaveBeenCalled();
    expect(usersService.findOne).not.toHaveBeenCalled();
    expect(batchGenerationService.getReviewInboxSummary).toHaveBeenCalledWith(
      organizationId,
      brandId,
      5,
    );
    expect(result).toEqual({
      analytics: {},
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
            reviewDecision: 'unset',
            status: 'completed',
            summary: 'Autopilot image review',
          },
        ],
        rejectedCount: 0,
      },
      timeSeries: [],
    });
  });

  it('reuses the short-lived overview bootstrap cache for repeated reloads', async () => {
    const organizationId = 'test-object-id';
    const brandId = 'test-brand-id';
    const userId = 'test-user-id';
    accessBootstrapCacheService.get.mockResolvedValue({
      access: {
        brandId,
        hasGeneratedFirstAsset: false,
        hasDismissedAssetGate: false,
        creditsBalance: 0,
        hasEverHadCredits: false,
        isOnboardingCompleted: true,
        isSuperAdmin: false,
        memberRole: null,
        organizationId,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionTier: SubscriptionTier.PRO,
        userId,
      },
      brands: [],
      currentUser: null,
      fleetCapabilities: null,
      settings: null,
      streak: null,
    } satisfies AccessBootstrapCachePayload);
    const request = {
      context: {
        brandId,
        organizationId,
        userId,
      },
      user: {
        id: 'authProvider_4',
        brandId: brandId,
        organizationId: organizationId,
        userId: userId,
      },
    } as never;

    const result1 = await service.getOverviewBootstrap(request);
    const result2 = await service.getOverviewBootstrap(request);

    expect(result1).toEqual(result2);
    expect(batchGenerationService.getReviewInboxSummary).toHaveBeenCalledTimes(
      1,
    );
    expect(accessBootstrapCacheService.get).toHaveBeenCalledTimes(1);
  });
});
