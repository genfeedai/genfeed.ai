import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { UsersController } from '@api/collections/users/controllers/users.controller';
import { UserOnboardingCompletionService } from '@api/collections/users/services/user-onboarding-completion.service';
import { AgentOnboardingToolHandler } from '@api/services/agent-orchestrator/tools/agent-onboarding-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { describe, expect, it } from 'vitest';

type Capture = { distinctId: string; event: string };
type UserRow = { id: string; isOnboardingCompleted: boolean };

/**
 * Cross-surface proof for genfeedai/genfeed.ai#5311: the agent-first
 * completion path (`AgentOnboardingToolHandler#completeOnboarding`) and the
 * classic wizard path (`UsersController#completeOnboardingFunnel`) both claim
 * the same User row's `isOnboardingCompleted` false->true transition and both
 * ultimately call the single shared `captureOnboardingCompletedBestEffort`
 * emission point in `server-funnel-capture.service.ts`. Only real class
 * wiring is used down to that shared function — only the outermost HTTP call
 * (`ServerFunnelCaptureService.capture`) is faked — so this test would catch
 * a regression in either surface, or in the shared function itself.
 */
describe('onboarding_completed cross-surface race (genfeedai/genfeed.ai#5311)', () => {
  const noop = async () => undefined;

  function world(userId: string, isOnboardingCompleted: boolean) {
    const captures: Capture[] = [];
    const organizationLookups: unknown[] = [];
    const user: UserRow = { id: userId, isOnboardingCompleted };
    // Both surfaces read before either writes, so each sees the row as it
    // was; only the atomic claim below decides who completes it.
    const snapshot = { ...user };
    const usersService = {
      findOne: async (_params?: unknown) => ({ ...snapshot }),
      async findOneSelect(params: unknown) {
        return this.findOne(params);
      },
      // The single Postgres row's `isOnboardingCompleted` WHERE-clause guard:
      // only an update matching `isOnboardingCompleted: false` can win.
      patchAll: async (
        filter: { isOnboardingCompleted?: boolean },
        update: Partial<UserRow>,
      ) => {
        if (filter.isOnboardingCompleted !== user.isOnboardingCompleted) {
          return { modifiedCount: 0 };
        }
        Object.assign(user, update);
        return { modifiedCount: 1 };
      },
    };
    const serverFunnelCaptureService = {
      capture: async (capture: Capture) => {
        captures.push(capture);
      },
    };
    const userAccessCacheService = { invalidateAll: noop };
    const controller = new UsersController(
      ...([
        {}, // brandsService — unused by completeOnboardingFunnel
        usersService,
        {}, // subscriptionsService
        {}, // filesClientService
        userAccessCacheService,
        {}, // settingsService
        new UserOnboardingCompletionService(
          ...([
            usersService,
            userAccessCacheService,
            { emitAsync: noop },
            { patch: async () => ({}) },
            serverFunnelCaptureService,
          ] as unknown as ConstructorParameters<
            typeof UserOnboardingCompletionService
          >),
        ),
      ] as unknown as ConstructorParameters<typeof UsersController>),
    );
    const updateMe = () =>
      controller.updateMe(
        ...([
          {
            get: () => 'localhost',
            headers: {},
            path: '/users',
            protocol: 'https',
          },
          { id: userId, userId },
          { isOnboardingCompleted: true },
        ] as unknown as Parameters<UsersController['updateMe']>),
      );

    return {
      captures,
      organizationLookups,
      serverFunnelCaptureService,
      updateMe,
      user,
      usersService,
    };
  }

  it('captures onboarding_completed at most once when the agent-first path and the classic wizard race for the same user', async () => {
    const w = world('user-1', false);
    const context: ToolExecutionContext = {
      organizationId: 'organization-1',
      userId: 'user-1',
    };
    const organizationsService = {
      findOne: async (where: unknown) => {
        w.organizationLookups.push(where);
        return { accountType: 'CREATOR', id: context.organizationId };
      },
      async findOneSelect(params: unknown) {
        return this.findOne(params);
      },
      patch: noop,
    };
    // Real OnboardingCreditGrantsService so the agent-first path exercises its
    // actual `captureOnboardingCompletedBestEffort` delegation to the shared
    // function, faked only at the leaf HTTP-capture boundary.
    const onboardingCreditGrantsService = new OnboardingCreditGrantsService(
      ...([
        {},
        {},
        {},
        // The trial is already over, so the trial-credit grant is a no-op here.
        {
          getState: async () => ({ isTrialExpired: true, trialEndsAt: null }),
        },
        { warn: () => undefined },
        w.serverFunnelCaptureService,
      ] as unknown as ConstructorParameters<
        typeof OnboardingCreditGrantsService
      >),
    );
    const handler = new AgentOnboardingToolHandler(
      ...([
        {}, // brandsService
        {
          findOne: async () => null,
          findOneSelect: async () => null,
        }, // postsService
        {}, // creditsUtilsService
        onboardingCreditGrantsService,
        undefined, // credentialsService
        undefined, // imagesService
        organizationsService,
        undefined, // organizationSettingsService
        w.usersService,
      ] as unknown as ConstructorParameters<typeof AgentOnboardingToolHandler>),
    );

    await Promise.all([w.updateMe(), handler.completeOnboarding(context)]);

    expect(w.organizationLookups).toEqual([
      { id: 'organization-1', isDeleted: false },
    ]);
    expect(w.user.isOnboardingCompleted).toBe(true);
    expect(w.captures).toEqual([
      { distinctId: 'user-1', event: 'onboarding_completed' },
    ]);
  });

  it('never captures again once the agent-first path has already completed the user', async () => {
    // The agent-first path already completed this user before the wizard's
    // PATCH /users/me request lands.
    const w = world('user-2', true);

    await w.updateMe();

    expect(w.user.isOnboardingCompleted).toBe(true);
    expect(w.captures).toEqual([]);
  });
});
