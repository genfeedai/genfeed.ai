import { AuthBootstrapController } from '@api/auth/controllers/auth-bootstrap.controller';
import { AuthBootstrapService } from '@api/auth/services/auth-bootstrap.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockShellBootstrapPayload = {
  access: {
    brandId: 'brand_1',
    creditsBalance: 500,
    hasEverHadCredits: true,
    isOnboardingCompleted: true,
    isSuperAdmin: false,
    organizationId: 'org_abc',
    subscriptionStatus: 'active',
    subscriptionTier: 'pro',
    userId: 'user_123',
  },
  brands: [{ id: 'brand_1', label: 'Alpha' }],
  currentUser: { id: 'user_123', name: 'Alice' },
  darkroomCapabilities: null,
  settings: { organization: 'org_abc' },
  streak: { currentStreak: 5 },
};

const mockOverviewBootstrapPayload = {
  activeRuns: [{ id: 'run_2' }],
  analytics: { totalPosts: 12 },
  reviewInbox: {
    approvedCount: 0,
    changesRequestedCount: 0,
    pendingCount: 0,
    readyCount: 0,
    recentItems: [],
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
};

const mockAuthBootstrapService = {
  getBootstrap: vi.fn(),
  getOverviewBootstrap: vi.fn(),
};

describe('AuthBootstrapController', () => {
  let controller: AuthBootstrapController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthBootstrapController],
      providers: [
        {
          provide: AuthBootstrapService,
          useValue: mockAuthBootstrapService,
        },
      ],
    }).compile();

    controller = module.get<AuthBootstrapController>(AuthBootstrapController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('forwards the shell bootstrap request to the service', async () => {
    const req = {
      context: { brandId: 'brand_1', organizationId: 'org_abc', userId: 'u1' },
      user: { id: 'clerk_user_1' },
    } as Parameters<AuthBootstrapController['bootstrap']>[0];
    mockAuthBootstrapService.getBootstrap.mockResolvedValue(
      mockShellBootstrapPayload,
    );

    const result = await controller.bootstrap(req);

    expect(mockAuthBootstrapService.getBootstrap).toHaveBeenCalledWith(req);
    expect(result).toEqual(mockShellBootstrapPayload);
  });

  it('forwards the overview bootstrap request to the service', async () => {
    const req = { user: { id: 'clerk_user_2' } } as Parameters<
      AuthBootstrapController['overviewBootstrap']
    >[0];
    mockAuthBootstrapService.getOverviewBootstrap.mockResolvedValue(
      mockOverviewBootstrapPayload,
    );

    const result = await controller.overviewBootstrap(req);

    expect(mockAuthBootstrapService.getOverviewBootstrap).toHaveBeenCalledWith(
      req,
    );
    expect(result).toEqual(mockOverviewBootstrapPayload);
  });

  it('propagates service errors for both bootstrap endpoints', async () => {
    mockAuthBootstrapService.getBootstrap.mockRejectedValue(
      new Error('Shell bootstrap failed'),
    );
    mockAuthBootstrapService.getOverviewBootstrap.mockRejectedValue(
      new Error('Overview bootstrap failed'),
    );

    await expect(controller.bootstrap({} as never)).rejects.toThrow(
      'Shell bootstrap failed',
    );
    await expect(controller.overviewBootstrap({} as never)).rejects.toThrow(
      'Overview bootstrap failed',
    );
  });
});
