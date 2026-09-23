import { AgentOnboardingToolHandler } from '@api/services/agent-orchestrator/tools/agent-onboarding-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  ContentIntelligencePlatform,
  RouterPriority,
  TargetExecutionState,
} from '@genfeedai/contracts';
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
    generateContentWorkflow: vi
      .fn()
      .mockResolvedValue([{ content: 'Generated tweet' }]),
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
    { error: vi.fn(), warn: vi.fn() } as never,
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
    brandsService,
    contentGeneratorService,
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

describe('Agent onboarding first draft', () => {
  it('generates exactly one brand-grounded tweet and cost-priority image before connection', async () => {
    vi.stubEnv('GENFEED_CLOUD', '1');
    const {
      handler,
      brandsService,
      contentGeneratorService,
      generationGateway,
    } = createHandler({
      brand: {
        id: 'brand-1',
        label: 'Acme Bikes',
        description: 'Handmade commuter bicycles',
      },
    });
    generationGateway.generateImage.mockResolvedValue({
      data: {
        id: undefined,
        attributes: { url: 'https://cdn.example.com/first-post.png' },
      },
    } as never);
    const result = await handler.generateOnboardingContent(
      { brandId: 'brand-1' },
      CONTEXT,
    );
    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: 'brand-1',
      organizationId: 'organization-1',
      isDeleted: false,
    });
    expect(
      contentGeneratorService.generateContentWorkflow,
    ).toHaveBeenCalledExactlyOnceWith(
      'user-1',
      'organization-1',
      expect.objectContaining({
        brandId: 'brand-1',
        platform: ContentIntelligencePlatform.TWITTER,
        variationsCount: 1,
        topic: expect.stringContaining('Handmade commuter bicycles'),
      }),
    );
    expect(generationGateway.generateImage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        body: expect.objectContaining({
          prioritize: RouterPriority.COST,
          prompt: expect.stringContaining('Generated tweet'),
        }),
        principal: {
          brandId: 'brand-1',
          organizationId: 'organization-1',
          userId: 'user-1',
        },
      }),
    );
    expect(result.success).toBe(true);
    expect(result.data?.isComplete).toBe(true);
    expect(result.nextActions).toHaveLength(1);
    expect(result.nextActions?.[0]).toMatchObject({
      type: 'content_preview_card',
      brandId: 'brand-1',
      tweets: ['Generated tweet'],
      images: ['https://cdn.example.com/first-post.png'],
      ctas: expect.arrayContaining([
        expect.objectContaining({ label: 'Looks good', action: 'send_prompt' }),
      ]),
    });
  });

  it.each([null, '', '   '])(
    'treats empty optional generation fields as absent: %s',
    async (empty) => {
      vi.stubEnv('GENFEED_CLOUD', '1');
      const { handler, contentGeneratorService, generationGateway } =
        createHandler({ brand: { id: 'brand-1', label: 'Acme' } });
      const result = await handler.generateOnboardingContent(
        { brandId: empty, retryTweet: empty },
        { ...CONTEXT, brandId: 'brand-1' },
      );
      expect(
        contentGeneratorService.generateContentWorkflow,
      ).toHaveBeenCalledOnce();
      expect(generationGateway.generateImage).toHaveBeenCalledOnce();
      expect(result.data?.tweets).toEqual(['Generated tweet']);
    },
  );

  it.each([42, {}, 'x'.repeat(281)])(
    'rejects malformed retry text before spending credits: %s',
    async (retryTweet) => {
      vi.stubEnv('GENFEED_CLOUD', '1');
      const { handler, contentGeneratorService, generationGateway } =
        createHandler({ brand: { id: 'brand-1' } });
      const result = await handler.generateOnboardingContent(
        { retryTweet },
        { ...CONTEXT, brandId: 'brand-1' },
      );
      expect(result.success).toBe(false);
      expect(
        contentGeneratorService.generateContentWorkflow,
      ).not.toHaveBeenCalled();
      expect(generationGateway.generateImage).not.toHaveBeenCalled();
    },
  );

  it('preserves the tweet and an honest retry when image generation fails', async () => {
    vi.stubEnv('GENFEED_CLOUD', '1');
    const { handler, generationGateway } = createHandler({
      brand: { id: 'brand-1', label: 'Acme' },
    });
    generationGateway.generateImage.mockRejectedValue(
      new Error('Provider unavailable'),
    );
    const result = await handler.generateOnboardingContent(
      { brandId: 'brand-1' },
      CONTEXT,
    );
    expect(result.data).toMatchObject({
      tweets: ['Generated tweet'],
      images: [],
      isComplete: false,
    });
    expect(result.nextActions?.[0].ctas).toEqual([
      expect.objectContaining({ label: 'Retry image' }),
    ]);
    expect(result.nextActions?.[0].description).toContain(
      'could not be generated',
    );
  });

  it('applies requested refinements to both the tweet and the image', async () => {
    vi.stubEnv('GENFEED_CLOUD', '1');
    const { handler, contentGeneratorService, generationGateway } =
      createHandler({ brand: { id: 'brand-1' } });
    await handler.generateOnboardingContent(
      { direction: 'Use a calmer tone and focus on commuter bikes.' },
      { ...CONTEXT, brandId: 'brand-1' },
    );
    expect(
      contentGeneratorService.generateContentWorkflow,
    ).toHaveBeenCalledWith(
      'user-1',
      'organization-1',
      expect.objectContaining({
        additionalContext: expect.arrayContaining([
          'Apply these requested changes: Use a calmer tone and focus on commuter bikes.',
        ]),
      }),
    );
    expect(generationGateway.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          prompt: expect.stringContaining(
            'Use a calmer tone and focus on commuter bikes.',
          ),
        }),
      }),
    );
  });

  it('does not generate an image for an invalid over-length tweet', async () => {
    vi.stubEnv('GENFEED_CLOUD', '1');
    const { handler, contentGeneratorService, generationGateway } =
      createHandler({ brand: { id: 'brand-1' } });
    contentGeneratorService.generateContentWorkflow.mockResolvedValue([
      { content: 'x'.repeat(281) },
    ]);
    const result = await handler.generateOnboardingContent(
      {},
      { ...CONTEXT, brandId: 'brand-1' },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('tweet length limit');
    expect(generationGateway.generateImage).not.toHaveBeenCalled();
  });

  it('retries only the image at cost priority using the current thread brand', async () => {
    vi.stubEnv('GENFEED_CLOUD', '1');
    const { handler, contentGeneratorService, generationGateway } =
      createHandler({ brand: { id: 'brand-1', label: 'Acme' } });
    generationGateway.generateImage.mockResolvedValue({
      data: {
        id: undefined,
        attributes: { url: 'https://cdn.example.com/retry.png' },
      },
    } as never);
    const result = await handler.generateOnboardingContent(
      { retryTweet: 'Keep this approved text' },
      { ...CONTEXT, brandId: 'brand-1' },
    );
    expect(
      contentGeneratorService.generateContentWorkflow,
    ).not.toHaveBeenCalled();
    expect(generationGateway.generateImage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        body: expect.objectContaining({ prioritize: RouterPriority.COST }),
      }),
    );
    expect(result.data).toMatchObject({
      isComplete: true,
      tweets: ['Keep this approved text'],
      images: ['https://cdn.example.com/retry.png'],
    });
  });

  it('explains insufficient image credits without discarding the tweet', async () => {
    vi.stubEnv('GENFEED_CLOUD', '1');
    const { handler, generationGateway } = createHandler({
      brand: { id: 'brand-1' },
    });
    generationGateway.generateImage.mockRejectedValue(
      new Error('Insufficient credits'),
    );
    const result = await handler.generateOnboardingContent(
      {},
      { ...CONTEXT, brandId: 'brand-1' },
    );
    expect(result.nextActions?.[0].description).toContain('not enough credits');
    expect(result.data?.tweets).toEqual(['Generated tweet']);
  });

  it('does not report a missing image URL as a completed draft', async () => {
    vi.stubEnv('GENFEED_CLOUD', '1');
    const { handler } = createHandler({ brand: { id: 'brand-1' } });
    const result = await handler.generateOnboardingContent(
      { brandId: 'brand-1' },
      CONTEXT,
    );
    expect(result.data?.isComplete).toBe(false);
  });

  it('does not generate for an unavailable or differently scoped brand', async () => {
    vi.stubEnv('GENFEED_CLOUD', '1');
    const { handler, contentGeneratorService, generationGateway } =
      createHandler();
    expect(
      (
        await handler.generateOnboardingContent(
          { brandId: 'other-brand' },
          { ...CONTEXT, brandId: 'brand-1' },
        )
      ).success,
    ).toBe(false);
    expect(
      (await handler.generateOnboardingContent({ brandId: 'brand-1' }, CONTEXT))
        .success,
    ).toBe(false);
    expect(
      contentGeneratorService.generateContentWorkflow,
    ).not.toHaveBeenCalled();
    expect(generationGateway.generateImage).not.toHaveBeenCalled();
  });

  it('does not spend an image generation when text generation fails', async () => {
    vi.stubEnv('GENFEED_CLOUD', '1');
    const { handler, contentGeneratorService, generationGateway } =
      createHandler({ brand: { id: 'brand-1' } });
    contentGeneratorService.generateContentWorkflow.mockRejectedValue(
      new Error('Text provider unavailable'),
    );
    expect(
      (await handler.generateOnboardingContent({ brandId: 'brand-1' }, CONTEXT))
        .success,
    ).toBe(false);
    expect(generationGateway.generateImage).not.toHaveBeenCalled();
  });
});
