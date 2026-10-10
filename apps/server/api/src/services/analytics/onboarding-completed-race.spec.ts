import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { UsersController } from '@api/collections/users/controllers/users.controller';
import { UserOnboardingCompletionService } from '@api/collections/users/services/user-onboarding-completion.service';
import { AgentOnboardingToolHandler } from '@api/services/agent-orchestrator/tools/agent-onboarding-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { describe, expect, it, vi } from 'vitest';

/**
 * Cross-surface proof for genfeedai/genfeed.ai#5311: the agent-first
 * completion path (`AgentOnboardingToolHandler#completeOnboarding`) and the
 * classic wizard path (`UsersController#completeOnboardingFunnel`) both claim
 * the same User row's `isOnboardingCompleted` false->true transition and both
 * ultimately call the single shared `captureOnboardingCompletedBestEffort`
 * emission point in `server-funnel-capture.service.ts`. Only real class
 * wiring is used down to that shared function — only the outermost HTTP call
 * (`ServerFunnelCaptureService.capture`) is mocked — so this test would catch
 * a regression in either surface, or in the shared function itself.
 */
describe('onboarding_completed cross-surface race (genfeedai/genfeed.ai#5311)', () => {
  it('captures onboarding_completed at most once when the agent-first path and the classic wizard race for the same user', async () => {
    const USER_ID = 'user-1';
    const CONTEXT: ToolExecutionContext = {
      organizationId: 'organization-1',
      userId: USER_ID,
    };
    const mockUser = { id: USER_ID, userId: USER_ID } as never;
    const mockRequest = {
      get: vi.fn().mockReturnValue('localhost'),
      headers: {},
      path: '/users',
      protocol: 'https',
    } as never;

    // Shared persistence: both surfaces read and atomically claim the same
    // row. `claimed` models the single Postgres row's `isOnboardingCompleted`
    // column — only the first `updateMany` matching `isOnboardingCompleted:
    // false` can win, exactly like the real WHERE-clause guard.
    let claimed = false;
    const usersService = {
      findOne: vi
        .fn()
        .mockResolvedValue({ id: USER_ID, isOnboardingCompleted: false }),
      patchAll: vi
        .fn()
        .mockImplementation(
          async (filter: { isOnboardingCompleted?: boolean }) => {
            if (filter.isOnboardingCompleted === false && !claimed) {
              claimed = true;
              return { modifiedCount: 1 };
            }
            return { modifiedCount: 0 };
          },
        ),
    };

    const serverFunnelCaptureService = {
      capture: vi.fn().mockResolvedValue(undefined),
    };
    const userAccessCacheService = {
      invalidateAll: vi.fn().mockResolvedValue(undefined),
    };
    const organizationsService = {
      findOne: vi.fn().mockResolvedValue({
        id: CONTEXT.organizationId,
        accountType: 'CREATOR',
      }),
      patch: vi.fn(),
    };

    // Real OnboardingCreditGrantsService (not mocked) so the agent-first path
    // exercises its actual `captureOnboardingCompletedBestEffort` delegation
    // to the shared function, mocked only at the leaf HTTP-capture boundary.
    const onboardingCreditGrantsService = new OnboardingCreditGrantsService(
      {} as never,
      {} as never,
      {} as never,
      // The trial is already over, so the trial-credit grant is a no-op here.
      {
        getState: vi
          .fn()
          .mockResolvedValue({ isTrialExpired: true, trialEndsAt: null }),
      } as never,
      { warn: vi.fn() } as never,
      serverFunnelCaptureService as never,
    );

    const controller = new UsersController(
      {} as never, // brandsService — unused by completeOnboardingFunnel
      usersService as never,
      {} as never, // subscriptionsService
      {} as never, // filesClientService
      userAccessCacheService as never,
      {} as never, // settingsService
      new UserOnboardingCompletionService(
        usersService as never,
        userAccessCacheService as never,
        { emitAsync: vi.fn() } as never,
        serverFunnelCaptureService as never,
      ),
    );

    const handler = new AgentOnboardingToolHandler(
      { error: vi.fn(), warn: vi.fn() } as never,
      {} as never, // configService
      {} as never, // brandsService
      { findOne: vi.fn().mockResolvedValue(null) } as never, // postsService
      {} as never, // creditsUtilsService
      {} as never, // contentGeneratorService
      {} as never, // generationGateway
      onboardingCreditGrantsService,
      undefined, // credentialsService
      undefined, // imagesService
      organizationsService as never,
      undefined, // organizationSettingsService
      usersService as never,
    );

    await Promise.all([
      controller.updateMe(mockRequest, mockUser, {
        isOnboardingCompleted: true,
      } as never),
      handler.completeOnboarding(CONTEXT),
    ]);

    expect(organizationsService.findOne).toHaveBeenCalledWith({
      id: CONTEXT.organizationId,
      isDeleted: false,
    });
    expect(usersService.patchAll).toHaveBeenCalledTimes(2);
    expect(serverFunnelCaptureService.capture).toHaveBeenCalledTimes(1);
    expect(serverFunnelCaptureService.capture).toHaveBeenCalledWith({
      distinctId: USER_ID,
      event: 'onboarding_completed',
    });
  });

  it('never captures again once the agent-first path has already completed the user', async () => {
    const USER_ID = 'user-2';
    const mockUser = { id: USER_ID, userId: USER_ID } as never;
    const mockRequest = {
      get: vi.fn().mockReturnValue('localhost'),
      headers: {},
      path: '/users',
      protocol: 'https',
    } as never;

    // The agent-first path already completed this user before the wizard's
    // PATCH /users/me request lands.
    const usersService = {
      findOne: vi
        .fn()
        .mockResolvedValue({ id: USER_ID, isOnboardingCompleted: true }),
      patchAll: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    };
    const serverFunnelCaptureService = {
      capture: vi.fn().mockResolvedValue(undefined),
    };
    const userAccessCacheService = {
      invalidateAll: vi.fn().mockResolvedValue(undefined),
    };

    const controller = new UsersController(
      {} as never,
      usersService as never,
      {} as never,
      {} as never,
      userAccessCacheService as never,
      {} as never, // settingsService
      new UserOnboardingCompletionService(
        usersService as never,
        userAccessCacheService as never,
        { emitAsync: vi.fn() } as never,
        serverFunnelCaptureService as never,
      ),
    );

    await controller.updateMe(mockRequest, mockUser, {
      isOnboardingCompleted: true,
    } as never);

    expect(serverFunnelCaptureService.capture).not.toHaveBeenCalled();
  });
});
