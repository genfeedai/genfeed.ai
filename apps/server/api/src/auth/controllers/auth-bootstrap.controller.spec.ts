import { AuthBootstrapController } from '@api/auth/controllers/auth-bootstrap.controller';
import type { AuthenticatedUser as PolicyUser } from '@api/auth/interfaces/authenticated-user.interface';
import { AuthBootstrapService } from '@api/auth/services/auth-bootstrap.service';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { getTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { testId as policyTestId } from '@helpers/testing/test-id.helper';
import { getTenantContext } from '@libs/prisma/tenant-context';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { defer, firstValueFrom } from 'rxjs';
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
  fleetCapabilities: null,
  settings: { organization: 'org_abc' },
  streak: { currentStreak: 5 },
};

const mockOverviewBootstrapPayload = {
  activeRuns: [{ id: 'run_2' }],
  analytics: {},
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
    topRequestedModels: [{ count: 1, model: 'openai/gpt-5.6-terra' }],
    totalCreditsToday: 15,
    totalRuns: 10,
    trends: [],
    webEnabledRuns: 1,
  },
  timeSeries: [],
};

const mockAuthBootstrapService = {
  getBootstrap: vi.fn(),
  getOverviewBootstrap: vi.fn(),
};

describe('AuthBootstrapController', () => {
  it('keeps overviewBootstrap original identity behind the real owner interceptor', async () => {
    const owner: PolicyUser = {
      id: policyTestId('user'),
      userId: policyTestId('user'),
      organizationId: policyTestId('org'),
      brandId: policyTestId('brand'),
      isSuperAdmin: true,
      isApiKey: true,
      scopes: ['read'],
    };
    const req = {
      method: 'GET',
      query: {} as Record<string, string>,
      user: owner,
      context: {
        ...owner,
        isSuperAdmin: true,
        subscriptionTier: 'pro',
        stripeSubscriptionStatus: 'active',
        hydratedAt: 1,
      },
    };
    const context = req.context;
    const before = { ...context };
    const execution = {
      getClass: () => AuthBootstrapController,
      getHandler: () => AuthBootstrapController.prototype.overviewBootstrap,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    const interceptor = new TenantContextInterceptor(new Reflector());
    mockAuthBootstrapService.getOverviewBootstrap.mockResolvedValue(
      mockOverviewBootstrapPayload,
    );
    const handle = vi.fn(() =>
      defer(async () => {
        expect(getTenantContext()?.organizationId).toBe(owner.organizationId);
        expect(getTenantReadScope()).toBeUndefined();
        return controller.overviewBootstrap(
          req as unknown as Parameters<
            AuthBootstrapController['overviewBootstrap']
          >[0],
        );
      }),
    );
    req.query = { organizationId: policyTestId('org', 2) };
    expect(() => interceptor.intercept(execution, { handle })).toThrow(
      expect.objectContaining({ status: 403 }),
    );
    expect(handle).not.toHaveBeenCalled();
    expect(
      mockAuthBootstrapService.getOverviewBootstrap,
    ).not.toHaveBeenCalled();
    const selections: Array<Record<string, string>> = [
      {},
      { organizationId: owner.organizationId },
    ];
    for (const query of selections) {
      req.query = query;
      const result = await firstValueFrom(
        interceptor.intercept(execution, { handle }),
      );
      expect(
        mockAuthBootstrapService.getOverviewBootstrap,
      ).toHaveBeenCalledWith(req);
      expect(result).toEqual(mockOverviewBootstrapPayload);
      expect(req.user).toBe(owner);
      expect(req.context).toBe(context);
      expect(req.context).toEqual(before);
    }
  });
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
      user: { id: 'authProvider_user_1' },
    } as Parameters<AuthBootstrapController['bootstrap']>[0];
    mockAuthBootstrapService.getBootstrap.mockResolvedValue(
      mockShellBootstrapPayload,
    );

    const result = await controller.bootstrap(req);

    expect(mockAuthBootstrapService.getBootstrap).toHaveBeenCalledWith(req);
    expect(result).toEqual(mockShellBootstrapPayload);
  });

  it('forwards the overview bootstrap request to the service', async () => {
    const req = { user: { id: 'authProvider_user_2' } } as Parameters<
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
