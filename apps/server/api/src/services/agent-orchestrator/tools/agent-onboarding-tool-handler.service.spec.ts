import { AgentOnboardingToolHandler } from '@api/services/agent-orchestrator/tools/agent-onboarding-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { AgentUiAction } from '@genfeedai/contracts/interfaces';
import {
  ONBOARDING_JOURNEY_MISSIONS,
  type OnboardingJourneyMissionId,
} from '@genfeedai/contracts/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

const CONTEXT: ToolExecutionContext = {
  organizationId: 'organization-1',
  userId: 'user-1',
};

function createMissionState() {
  return ONBOARDING_JOURNEY_MISSIONS.map((mission) => ({
    completedAt: null,
    id: mission.id,
    isCompleted: false,
    rewardClaimed: false,
    rewardCredits: mission.rewardCredits,
  }));
}

function createHandler(options?: {
  brand?: Record<string, unknown> | null;
  byokKeys?: Record<string, unknown>;
  credential?: Record<string, unknown> | null;
  image?: Record<string, unknown> | null;
  isByokEnabled?: boolean;
  post?: Record<string, unknown> | null;
  video?: Record<string, unknown> | null;
}) {
  const missions = createMissionState();
  const creditsUtilsService = {
    addOrganizationCreditsWithExpiration: vi.fn().mockResolvedValue(undefined),
    getOrganizationCreditsWithExpiration: vi.fn().mockResolvedValue({
      credits: [{ balance: 100, source: 'onboarding-signup-gift' }],
      totalBalance: 100,
    }),
  };
  const organizationSettingsService = {
    findOne: vi.fn().mockResolvedValue({
      byokKeys: options?.byokKeys ?? {},
      id: 'settings-1',
      isByokEnabled: options?.isByokEnabled ?? false,
      onboardingJourneyCompletedAt: null,
      onboardingJourneyMissions: missions,
    }),
    getNextRecommendedJourneyMission: vi
      .fn()
      .mockImplementation(
        (state: ReturnType<typeof createMissionState>) =>
          state.find((mission) => !mission.isCompleted)?.id ?? null,
      ),
    normalizeJourneyState: vi.fn().mockImplementation(() => missions),
    patch: vi.fn().mockResolvedValue({}),
  };
  const brandsService = {
    create: vi.fn(),
    findCreateByIdentityConfirmationSource: vi.fn().mockResolvedValue(null),
    findOne: vi.fn().mockResolvedValue(options?.brand ?? null),
    resolveBrandKitAssets: vi.fn().mockResolvedValue({ references: [] }),
  };
  const credentialsService = {
    findOne: vi.fn().mockResolvedValue(options?.credential ?? null),
  };
  const imagesService = {
    findOne: vi.fn().mockResolvedValue(options?.image ?? null),
  };
  const videosService = {
    findOne: vi.fn().mockResolvedValue(options?.video ?? null),
  };
  const organizationsService = {
    findOne: vi.fn().mockResolvedValue({ accountType: 'CREATOR' }),
    patch: vi.fn(),
  };
  const usersService = {
    findOne: vi.fn(),
    patch: vi.fn(),
    patchAll: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
  const postsService = {
    findOne: vi.fn().mockResolvedValue(options?.post ?? null),
  };
  const onboardingCreditGrantsService = {
    captureOnboardingCompletedBestEffort: vi.fn(),
    grantTrialCreditsBestEffort: vi.fn().mockResolvedValue(true),
    completeMissions: vi
      .fn()
      .mockImplementation(
        async (_organizationId: string, ids: OnboardingJourneyMissionId[]) =>
          missions.map((mission) => ({
            ...mission,
            isCompleted: mission.isCompleted || ids.includes(mission.id),
            rewardClaimed: false,
            rewardCredits: 0,
          })),
      ),
  };
  const handler = new AgentOnboardingToolHandler(
    brandsService as never,
    postsService as never,
    creditsUtilsService as never,
    onboardingCreditGrantsService as never,
    credentialsService as never,
    imagesService as never,
    organizationsService as never,
    organizationSettingsService as never,
    usersService as never,
    videosService as never,
  );

  return {
    brandsService,
    credentialsService,
    creditsUtilsService,
    handler,
    imagesService,
    onboardingCreditGrantsService,
    organizationSettingsService,
    organizationsService,
    postsService,
    usersService,
    videosService,
  };
}

function getChecklist(result: {
  nextActions?: AgentUiAction[];
}): AgentUiAction {
  const checklist = result.nextActions?.[0];
  expect(checklist?.type).toBe('onboarding_checklist_card');
  if (!checklist) {
    throw new Error('Expected onboarding checklist action');
  }
  return checklist;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AgentOnboardingToolHandler Community behavior', () => {
  it('returns a zero-credit checklist without reading or writing the ledger', async () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    const { creditsUtilsService, handler, postsService } = createHandler();

    const result = await handler.checkOnboardingStatus(CONTEXT);
    const checklist = getChecklist(result);

    expect(postsService.findOne).toHaveBeenCalledWith(
      {
        organizationId: CONTEXT.organizationId,
        targetExecutionState: TargetExecutionState.PUBLISHED,
      },
      [],
    );
    expect(checklist.checklist).toHaveLength(5);
    expect(checklist.checklist?.every((step) => step.rewardCredits === 0)).toBe(
      true,
    );
    expect(checklist).not.toHaveProperty('earnedCredits');
    expect(checklist).not.toHaveProperty('totalJourneyCredits');
    expect(checklist).not.toHaveProperty('signupGiftCredits');
    expect(checklist).not.toHaveProperty('journeyEarnedCredits');
    expect(checklist).not.toHaveProperty('journeyRemainingCredits');
    expect(checklist).not.toHaveProperty('totalOnboardingCreditsVisible');
    expect(result.data).not.toHaveProperty('earnedCredits');
    expect(result.data).not.toHaveProperty('signupGiftCredits');
    expect(result.data).not.toHaveProperty('journeyEarnedCredits');
    expect(result.data).not.toHaveProperty('journeyRemainingCredits');
    expect(result.data).not.toHaveProperty('totalOnboardingCreditsVisible');
    expect(
      checklist.checklist?.every(
        (step) => !/credit|reward/i.test(step.description ?? ''),
      ),
    ).toBe(true);
    expect(
      creditsUtilsService.getOrganizationCreditsWithExpiration,
    ).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.addOrganizationCreditsWithExpiration,
    ).not.toHaveBeenCalled();
  });

  it('uses self-hosted CTA destinations for every checklist mission', async () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    const { handler } = createHandler();

    const checklist = getChecklist(
      await handler.checkOnboardingStatus(CONTEXT),
    );

    expect(
      Object.fromEntries(
        checklist.checklist?.map((step) => [step.id, step.ctaHref]) ?? [],
      ),
    ).toEqual({
      complete_company_info: '/onboarding/brand',
      connect_social_account: '/settings/brands',
      generate_first_image: '/settings/api-keys',
      generate_first_video: '/settings/api-keys',
      publish_first_post: '/agent/new',
    });
  });

  it('does not grant rewards when a status refresh completes a mission', async () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    const { creditsUtilsService, handler, organizationSettingsService } =
      createHandler({ brand: { id: 'brand-1' } });

    const result = await handler.checkOnboardingStatus(CONTEXT);

    expect(result.data?.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'complete_company_info',
          isCompleted: true,
          rewardClaimed: false,
          rewardCredits: 0,
        }),
      ]),
    );
    expect(organizationSettingsService.patch).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.addOrganizationCreditsWithExpiration,
    ).not.toHaveBeenCalled();
  });

  it('surfaces only configured provider names and readiness', async () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    const { handler } = createHandler({
      byokKeys: {
        openai: {
          apiKey: 'encrypted-openai-key',
          isEnabled: true,
          provider: 'openai',
        },
        replicate: {
          apiKey: 'encrypted-replicate-key',
          isEnabled: false,
          provider: 'replicate',
        },
      },
      isByokEnabled: true,
    });

    const result = await handler.checkOnboardingStatus(CONTEXT);

    expect(result.data?.providerReadiness).toEqual({
      configuredImageProviders: [],
      configuredProviderCount: 1,
      configuredProviders: ['openai'],
      isImageReady: false,
      isReady: true,
    });
    expect(JSON.stringify(result)).not.toContain('encrypted-openai-key');
    expect(JSON.stringify(result)).not.toContain('encrypted-replicate-key');
  });

  it('counts configured keys even when the organization byok flag is off', async () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    const { handler } = createHandler({
      byokKeys: {
        openai: {
          apiKey: 'encrypted-openai-key',
          isEnabled: true,
          provider: 'openai',
        },
      },
      isByokEnabled: false,
    });

    const result = await handler.checkOnboardingStatus(CONTEXT);

    expect(result.data?.providerReadiness).toEqual({
      configuredImageProviders: [],
      configuredProviderCount: 1,
      configuredProviders: ['openai'],
      isImageReady: false,
      isReady: true,
    });
  });

  it('ignores byok entries whose secret is blank', async () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    const { handler } = createHandler({
      byokKeys: {
        openai: { apiKey: '   ', isEnabled: true, provider: 'openai' },
      },
      isByokEnabled: true,
    });

    const result = await handler.checkOnboardingStatus(CONTEXT);

    expect(result.data?.providerReadiness).toEqual({
      configuredImageProviders: [],
      configuredProviderCount: 0,
      configuredProviders: [],
      isImageReady: false,
      isReady: false,
    });
  });

  it('reports image readiness only for image-capable providers', async () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    const { handler } = createHandler({
      byokKeys: {
        fal: { apiKey: 'encrypted-fal-key', isEnabled: true, provider: 'fal' },
        openai: {
          apiKey: 'encrypted-openai-key',
          isEnabled: true,
          provider: 'openai',
        },
      },
      isByokEnabled: true,
    });

    const result = await handler.checkOnboardingStatus(CONTEXT);
    const imageStep = getChecklist(result).checklist?.find(
      (step) => step.id === 'generate_first_image',
    );

    expect(result.data?.providerReadiness).toEqual({
      configuredImageProviders: ['fal'],
      configuredProviderCount: 2,
      configuredProviders: ['fal', 'openai'],
      isImageReady: true,
      isReady: true,
    });
    expect(imageStep?.description).not.toContain('image provider API key');
  });

  it('keeps first image blocked when only a text-only provider is configured', async () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    const { handler } = createHandler({
      byokKeys: {
        openai: {
          apiKey: 'encrypted-openai-key',
          isEnabled: true,
          provider: 'openai',
        },
      },
      isByokEnabled: true,
    });

    const result = await handler.checkOnboardingStatus(CONTEXT);
    const imageStep = getChecklist(result).checklist?.find(
      (step) => step.id === 'generate_first_image',
    );

    // A configured text-only key satisfies `isReady`, but an image `generate` call has
    // nothing to call — the checklist must still route to the API-key CTA.
    expect(result.data?.providerReadiness).toMatchObject({
      isImageReady: false,
      isReady: true,
    });
    expect(imageStep).toMatchObject({
      ctaHref: '/settings/api-keys',
      isCompleted: false,
    });
    expect(imageStep?.description).toContain(
      'Add an image provider API key (fal, Replicate, or Leonardo)',
    );
  });

  it('keeps first image pending and points to API keys when no provider is configured', async () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    const { handler } = createHandler();

    const result = await handler.checkOnboardingStatus(CONTEXT);
    const checklist = getChecklist(result);
    const imageStep = checklist.checklist?.find(
      (step) => step.id === 'generate_first_image',
    );

    expect(result.data?.providerReadiness).toEqual({
      configuredImageProviders: [],
      configuredProviderCount: 0,
      configuredProviders: [],
      isImageReady: false,
      isReady: false,
    });
    expect(imageStep).toMatchObject({
      ctaHref: '/settings/api-keys',
      isCompleted: false,
      rewardCredits: 0,
    });
    expect(imageStep?.description).toContain('image provider API key');
  });

  it.each(ONBOARDING_JOURNEY_MISSIONS.map((mission) => mission.id))(
    'delegates %s completion to the atomic grant service',
    async (missionId) => {
      const {
        handler,
        onboardingCreditGrantsService,
        organizationSettingsService,
      } = createHandler();
      await handler.completeJourneyMission(CONTEXT, missionId);
      expect(
        onboardingCreditGrantsService.completeMissions,
      ).toHaveBeenCalledWith(
        CONTEXT.organizationId,
        [missionId],
        CONTEXT.userId,
      );
      expect(organizationSettingsService.patch).not.toHaveBeenCalled();
    },
  );
});

describe('Agent onboarding create_brand identity', () => {
  const SOURCE_ACTION_ID =
    'brand-identity-66666666-6666-4666-8666-666666666666';

  it('proposes voice and niche as structured fields, not description text', async () => {
    const { handler, brandsService } = createHandler();

    const result = await handler.createBrand(
      { label: 'Acme Bikes', niche: 'urban cycling', voice: 'playful' },
      CONTEXT,
    );

    expect(brandsService.create).not.toHaveBeenCalled();
    const proposal = (result.data as { proposal: Record<string, unknown> })
      .proposal;
    expect(proposal).toEqual({
      description: 'Brand profile for Acme Bikes, focused on urban cycling.',
      label: 'Acme Bikes',
      niche: 'urban cycling',
      slug: 'acme-bikes',
      voice: 'playful',
    });
    expect(result.nextActions?.[0]?.ctas?.[0]?.payload).toMatchObject({
      niche: 'urban cycling',
      voice: 'playful',
    });
  });

  it('stores a confirmed voice and niche in agentConfig instead of Brand.text', async () => {
    const { handler, brandsService } = createHandler();
    brandsService.create.mockResolvedValue({
      id: 'brand-new',
      slug: 'acme-bikes',
    });

    const result = await handler.createBrand(
      {
        description: 'Handmade commuter bicycles',
        label: 'Acme Bikes',
        niche: 'urban cycling',
        slug: 'acme-bikes',
        sourceActionId: SOURCE_ACTION_ID,
        voice: 'playful',
      },
      { ...CONTEXT, confirmationOrigin: 'thread-ui-action' },
    );

    expect(result.success).toBe(true);
    const createInput = brandsService.create.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(createInput).toMatchObject({
      agentConfig: {
        brandIdentityConfirmation: {
          createSourceActionId: SOURCE_ACTION_ID,
          requestedSlug: 'acme-bikes',
          source: 'agent-thread-ui-action',
        },
        strategy: { topics: ['urban cycling'] },
        voice: { tone: 'playful' },
      },
      description: 'Handmade commuter bicycles',
    });
    expect(createInput).not.toHaveProperty('text');
  });
});

describe('completeOnboarding funnel capture (genfeedai/genfeed.ai#4969, #5311)', () => {
  it('rejects Expert completion before handoff without any completion writes', async () => {
    const { handler, organizationsService, usersService } = createHandler();
    organizationsService.findOne.mockResolvedValue({ accountType: 'EXPERT' });
    usersService.findOne.mockResolvedValue({
      id: CONTEXT.userId,
      onboardingStepsCompleted: ['brand', 'positioning', 'corpus'],
    });
    const result = await handler.completeOnboarding(CONTEXT);
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('/onboarding'),
    });
    expect(organizationsService.patch).not.toHaveBeenCalled();
    expect(usersService.patchAll).not.toHaveBeenCalled();
  });

  it('delegates the onboarding_completed capture exactly once for a user completing for the first time', async () => {
    const { handler, onboardingCreditGrantsService, usersService } =
      createHandler();
    (usersService.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      isOnboardingCompleted: false,
    });
    (usersService.patchAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      modifiedCount: 1,
    });

    await handler.completeOnboarding(CONTEXT);

    expect(usersService.patchAll).toHaveBeenCalledWith(
      { id: 'user-1', isOnboardingCompleted: false },
      expect.objectContaining({ isOnboardingCompleted: true }),
    );
    expect(
      onboardingCreditGrantsService.captureOnboardingCompletedBestEffort,
    ).toHaveBeenCalledTimes(1);
    expect(
      onboardingCreditGrantsService.captureOnboardingCompletedBestEffort,
    ).toHaveBeenCalledWith('user-1');
    // Finishing onboarding starts the free trial with its 75 credits.
    expect(
      onboardingCreditGrantsService.grantTrialCreditsBestEffort,
    ).toHaveBeenCalledWith(CONTEXT.organizationId, 'user-1');
  });

  it('does not re-capture for a user who was already onboarded (atomic claim matches 0 rows)', async () => {
    const { handler, onboardingCreditGrantsService, usersService } =
      createHandler();
    (usersService.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      isOnboardingCompleted: true,
    });
    (usersService.patchAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      modifiedCount: 0,
    });

    await handler.completeOnboarding(CONTEXT);

    expect(
      onboardingCreditGrantsService.captureOnboardingCompletedBestEffort,
    ).not.toHaveBeenCalled();
    // The grant is idempotent per user, so a repeat call retries it safely.
    expect(
      onboardingCreditGrantsService.grantTrialCreditsBestEffort,
    ).toHaveBeenCalledWith(CONTEXT.organizationId, 'user-1');
  });

  it('emits at most one completion event when two completion calls race for the same user', async () => {
    const { handler, onboardingCreditGrantsService, usersService } =
      createHandler();
    (usersService.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      isOnboardingCompleted: false,
    });

    // Model the real Postgres guarantee: `isOnboardingCompleted: false` is
    // part of the WHERE clause, so only the first of two racing updateMany
    // calls can match the still-false row.
    let claimed = false;
    (usersService.patchAll as ReturnType<typeof vi.fn>).mockImplementation(
      async (filter: { isOnboardingCompleted?: boolean }) => {
        if (filter.isOnboardingCompleted === false && !claimed) {
          claimed = true;
          return { modifiedCount: 1 };
        }
        return { modifiedCount: 0 };
      },
    );

    await Promise.all([
      handler.completeOnboarding(CONTEXT),
      handler.completeOnboarding(CONTEXT),
    ]);

    expect(usersService.patchAll).toHaveBeenCalledTimes(2);
    expect(
      onboardingCreditGrantsService.captureOnboardingCompletedBestEffort,
    ).toHaveBeenCalledTimes(1);
    expect(
      onboardingCreditGrantsService.captureOnboardingCompletedBestEffort,
    ).toHaveBeenCalledWith('user-1');
  });

  it('leaves the prior completion timestamp unchanged and never calls patch on a repeated call', async () => {
    const { handler, onboardingCreditGrantsService, usersService } =
      createHandler();
    const completedAt = new Date('2026-01-01T00:00:00.000Z');
    // A stateful persistence mock, not a hardcoded return value: `patchAll`
    // only "writes" when its WHERE filter actually matches the current
    // row, exactly like the real atomic claim. This is what lets the
    // assertions below prove the timestamp survives, rather than merely
    // asserting on a return value the mock was told to produce regardless of
    // input.
    const persistedUser: {
      id: string;
      isOnboardingCompleted: boolean;
      onboardingCompletedAt: Date;
    } = {
      id: 'user-1',
      isOnboardingCompleted: true,
      onboardingCompletedAt: completedAt,
    };

    (usersService.findOne as ReturnType<typeof vi.fn>).mockImplementation(
      async () => ({ ...persistedUser }),
    );
    (usersService.patchAll as ReturnType<typeof vi.fn>).mockImplementation(
      async (
        filter: { isOnboardingCompleted?: boolean },
        update: Record<string, unknown>,
      ) => {
        if (
          filter.isOnboardingCompleted !== persistedUser.isOnboardingCompleted
        ) {
          return { modifiedCount: 0 };
        }
        Object.assign(persistedUser, update);
        return { modifiedCount: 1 };
      },
    );

    await handler.completeOnboarding(CONTEXT);
    await handler.completeOnboarding(CONTEXT);

    expect(usersService.patch).not.toHaveBeenCalled();
    expect(usersService.patchAll).toHaveBeenCalledTimes(2);
    expect(persistedUser.isOnboardingCompleted).toBe(true);
    expect(persistedUser.onboardingCompletedAt).toBe(completedAt);
    expect(
      onboardingCreditGrantsService.captureOnboardingCompletedBestEffort,
    ).not.toHaveBeenCalled();
  });
});

describe('onboarding journey completion race (genfeedai/genfeed.ai#5311)', () => {
  function createCompletableHandler() {
    return createHandler({
      brand: { id: 'brand-1' },
      credential: { id: 'credential-1' },
      image: { id: 'image-1' },
      post: { id: 'post-1' },
      video: { id: 'video-1' },
    });
  }

  it('does not let completed journey missions bypass required Expert steps', async () => {
    const h = createCompletableHandler();
    (
      h.organizationsService.findOne as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ accountType: 'EXPERT' });
    (h.usersService.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      isOnboardingCompleted: false,
    });
    await h.handler.checkOnboardingStatus(CONTEXT);
    expect(h.usersService.patchAll).not.toHaveBeenCalled();
    expect(h.organizationsService.patch).not.toHaveBeenCalled();
    expect(
      h.onboardingCreditGrantsService.captureOnboardingCompletedBestEffort,
    ).not.toHaveBeenCalled();
  });

  it('claims the false->true transition atomically and captures once when the journey completes', async () => {
    const { handler, onboardingCreditGrantsService, usersService } =
      createCompletableHandler();
    (usersService.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      isOnboardingCompleted: false,
    });
    (usersService.patchAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      modifiedCount: 1,
    });

    await handler.checkOnboardingStatus(CONTEXT);

    expect(usersService.patchAll).toHaveBeenCalledWith(
      { id: 'user-1', isOnboardingCompleted: false },
      expect.objectContaining({ isOnboardingCompleted: true }),
    );
    expect(
      onboardingCreditGrantsService.captureOnboardingCompletedBestEffort,
    ).toHaveBeenCalledTimes(1);
  });

  it('emits at most one completion event when two journey re-checks race for the same user', async () => {
    const { handler, onboardingCreditGrantsService, usersService } =
      createCompletableHandler();
    (usersService.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      isOnboardingCompleted: false,
    });

    let claimed = false;
    (usersService.patchAll as ReturnType<typeof vi.fn>).mockImplementation(
      async (filter: { isOnboardingCompleted?: boolean }) => {
        if (filter.isOnboardingCompleted === false && !claimed) {
          claimed = true;
          return { modifiedCount: 1 };
        }
        return { modifiedCount: 0 };
      },
    );

    await Promise.all([
      handler.checkOnboardingStatus(CONTEXT),
      handler.checkOnboardingStatus(CONTEXT),
    ]);

    expect(
      onboardingCreditGrantsService.captureOnboardingCompletedBestEffort,
    ).toHaveBeenCalledTimes(1);
  });

  it('never fires the funnel event when a journey re-check finds the user already onboarded', async () => {
    const { handler, onboardingCreditGrantsService, usersService } =
      createCompletableHandler();
    (usersService.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      isOnboardingCompleted: true,
    });
    (usersService.patchAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      modifiedCount: 0,
    });

    await handler.checkOnboardingStatus(CONTEXT);
    await handler.checkOnboardingStatus(CONTEXT);

    expect(
      onboardingCreditGrantsService.captureOnboardingCompletedBestEffort,
    ).not.toHaveBeenCalled();
  });
});
