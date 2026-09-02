import { AgentOnboardingToolHandler } from '@api/services/agent-orchestrator/tools/agent-onboarding-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { TargetExecutionState } from '@genfeedai/enums';
import type { AgentUiAction } from '@genfeedai/interfaces';
import {
  ONBOARDING_JOURNEY_MISSIONS,
  type OnboardingJourneyMissionId,
} from '@genfeedai/types';
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
  isByokEnabled?: boolean;
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
    findOne: vi.fn().mockResolvedValue(options?.brand ?? null),
  };
  const credentialsService = { findOne: vi.fn().mockResolvedValue(null) };
  const imagesService = { findOne: vi.fn().mockResolvedValue(null) };
  const contentGeneratorService = {
    generateText: vi.fn().mockResolvedValue({ text: 'Generated tweet' }),
  };
  const generationGateway = {
    generateImage: vi.fn().mockResolvedValue({
      data: { attributes: {}, id: undefined },
    }),
  };
  const configService = {
    ingredientsEndpoint: 'https://cdn.example.com/ingredients',
  };
  const organizationsService = { patch: vi.fn() };
  const usersService = { findOne: vi.fn(), patch: vi.fn() };
  const postsService = { findOne: vi.fn().mockResolvedValue(null) };
  const handler = new AgentOnboardingToolHandler(
    { error: vi.fn() } as never,
    configService as never,
    brandsService as never,
    postsService as never,
    creditsUtilsService as never,
    contentGeneratorService as never,
    generationGateway as never,
    credentialsService as never,
    imagesService as never,
    organizationsService as never,
    organizationSettingsService as never,
    usersService as never,
  );

  return {
    creditsUtilsService,
    generationGateway,
    handler,
    organizationSettingsService,
    postsService,
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
      publish_first_post: '/agent/onboarding',
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
    expect(organizationSettingsService.patch).toHaveBeenCalled();
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

    // A configured text-only key satisfies `isReady`, but `generate_image` has
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

  it('does not call the image API when only a text provider is configured', async () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    const { generationGateway, handler } = createHandler({
      byokKeys: {
        openai: {
          apiKey: 'encrypted-openai-key',
          isEnabled: true,
          provider: 'openai',
        },
      },
      isByokEnabled: true,
    });

    const result = await handler.generateOnboardingContent(
      { brandId: 'brand-1', brandName: 'Test brand' },
      CONTEXT,
    );
    const checklist = getChecklist(result);
    const imageStep = checklist.checklist?.find(
      (step) => step.id === 'generate_first_image',
    );

    expect(generationGateway.generateImage).not.toHaveBeenCalled();
    expect(imageStep).toMatchObject({
      ctaHref: '/settings/api-keys',
      isCompleted: false,
    });
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

  it.each([
    'complete_company_info',
    'connect_social_account',
    'generate_first_image',
    'generate_first_video',
    'publish_first_post',
  ] as OnboardingJourneyMissionId[])(
    'persists %s without claiming or granting a reward',
    async (missionId) => {
      vi.stubEnv('GENFEED_CLOUD', undefined);
      const { creditsUtilsService, handler, organizationSettingsService } =
        createHandler();

      await handler.completeJourneyMission(CONTEXT, missionId);

      expect(organizationSettingsService.patch).toHaveBeenCalledWith(
        'settings-1',
        expect.objectContaining({
          onboardingJourneyMissions: expect.arrayContaining([
            expect.objectContaining({
              id: missionId,
              isCompleted: true,
              rewardClaimed: false,
              rewardCredits: 0,
            }),
          ]),
        }),
      );
      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).not.toHaveBeenCalled();
    },
  );

  it('preserves cloud reward claiming behavior', async () => {
    vi.stubEnv('GENFEED_CLOUD', '1');
    const { creditsUtilsService, handler, organizationSettingsService } =
      createHandler();

    await handler.completeJourneyMission(CONTEXT, 'generate_first_image');

    expect(organizationSettingsService.patch).toHaveBeenCalledWith(
      'settings-1',
      expect.objectContaining({
        onboardingJourneyMissions: expect.arrayContaining([
          expect.objectContaining({
            id: 'generate_first_image',
            isCompleted: true,
            rewardClaimed: true,
            rewardCredits: 15,
          }),
        ]),
      }),
    );
    expect(
      creditsUtilsService.addOrganizationCreditsWithExpiration,
    ).toHaveBeenCalledWith(
      CONTEXT.organizationId,
      15,
      'onboarding-journey',
      'Onboarding journey reward: generate_first_image',
      expect.any(Date),
    );
  });
});
