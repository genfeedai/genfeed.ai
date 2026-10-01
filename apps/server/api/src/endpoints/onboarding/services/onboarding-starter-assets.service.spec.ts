import type { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import {
  clampOnboardingTweet,
  OnboardingStarterAssetsService,
} from '@api/endpoints/onboarding/services/onboarding-starter-assets.service';
import { BRAND_CONTEXT_CHARACTER_BUDGET } from '@api/services/agent-context-assembly/brand-context-budget.util';
import type { IAgentGenerationGateway } from '@api/services/agent-orchestrator/gateway/agent-generation-gateway.interface';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import type { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { RouterPriority } from '@genfeedai/contracts';
import { LOWEST_COST_IMAGE_MODEL_KEY } from '@genfeedai/contracts/constants';
import type { IBrandOsRevision } from '@genfeedai/contracts/interfaces';
import {
  BRAND_FIDELITY_HARNESS_PACK,
  CORE_CONTENT_HARNESS_PACK,
  type ContentHarnessInput,
  ContentHarnessRegistry,
  composeContentHarnessBrief,
  VIRAL_PSYCHOLOGY_HARNESS_PACK,
  X_PLATFORM_HARNESS_PACK,
} from '@genfeedai/harness';
import { buildBrandKitDraftFromManualInput } from '@genfeedai/helpers';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function approvedOnboardingRevision(version: number): IBrandOsRevision {
  const content = buildBrandKitDraftFromManualInput(
    { id: 'brand-1' },
    {
      description: `Approved offering ${version}`,
      label: `Approved identity ${version}`,
      voiceTone: `Distinctive voice ${version}`,
    },
  );
  for (const field of Object.values(content.fields)) {
    if (field) {
      field.currentValue = field.proposedValue;
      delete field.proposedValue;
    }
  }
  return {
    approvedAt: '2026-10-01T00:00:00.000Z',
    approvedById: 'user-1',
    brandId: 'brand-1',
    content,
    createdAt: '2026-10-01T00:00:00.000Z',
    exportSchemaVersion: '1.0.0',
    id: `revision-${version}`,
    organizationId: 'org-1',
    status: 'APPROVED',
    updatedAt: '2026-10-01T00:00:00.000Z',
    version,
  };
}

function realOnboardingHarness() {
  const registry = new ContentHarnessRegistry();
  for (const pack of [
    CORE_CONTENT_HARNESS_PACK,
    X_PLATFORM_HARNESS_PACK,
    BRAND_FIDELITY_HARNESS_PACK,
    VIRAL_PSYCHOLOGY_HARNESS_PACK,
  ])
    registry.registerPack(pack);
  const findApproved = vi
    .fn<BrandOsRevisionsService['findApproved']>()
    .mockResolvedValue(approvedOnboardingRevision(1));
  const findOne = vi.fn().mockResolvedValue({
    agentConfig: { voice: { tone: 'Saved fallback voice' } },
    description: 'Conflicting legacy description',
    id: 'brand-1',
    label: 'Conflicting legacy label',
  });
  const harness = new HarnessGenerationService(
    {
      composeBrief: (input: ContentHarnessInput) =>
        composeContentHarnessBrief(registry, input),
    } as never,
    { log: vi.fn(), warn: vi.fn() } as never,
    { findOne } as never,
    { resolveContributionForBrand: vi.fn().mockResolvedValue(null) } as never,
    { retrieveBrandContentMemory: vi.fn().mockResolvedValue([]) } as never,
    undefined,
    { findApproved } as never,
  );
  return { findApproved, findOne, harness };
}

describe('clampOnboardingTweet', () => {
  it('trims surrounding quotes and collapses whitespace', () => {
    // Quotes are stripped only when they sit flush against the content —
    // realistic for an LLM completion that wraps its answer in quotes with
    // no padding of its own.
    expect(clampOnboardingTweet('"Hello   world"')).toBe('Hello world');
  });

  it('leaves quotes in place when whitespace sits outside them', () => {
    expect(clampOnboardingTweet('  "Hello world"  ')).toBe('"Hello world"');
  });

  it('returns null for empty content', () => {
    expect(clampOnboardingTweet('   ')).toBeNull();
  });

  it('truncates on a word boundary past the tweet limit', () => {
    const long = `${'word '.repeat(70)}tail`;
    const clamped = clampOnboardingTweet(long);
    expect(clamped).not.toBeNull();
    expect(clamped?.length).toBeLessThanOrEqual(280);
    expect(clamped?.endsWith('word')).toBe(true);
  });
});

describe('OnboardingStarterAssetsService', () => {
  let brandsService: vi.Mocked<
    Pick<
      BrandsService,
      'findOne' | 'resolveBrandKitAssets' | 'updateAgentConfig'
    >
  >;
  let postsService: vi.Mocked<Pick<PostsService, 'create'>>;
  let llmDispatcherService: vi.Mocked<
    Pick<LlmDispatcherService, 'chatCompletion'>
  >;
  let configService: Pick<ConfigService, 'ingredientsEndpoint'>;
  let loggerService: vi.Mocked<Pick<LoggerService, 'error' | 'warn'>>;
  let generationGateway: vi.Mocked<
    Pick<IAgentGenerationGateway, 'generateImage'>
  >;
  let service: OnboardingStarterAssetsService;
  let harnessFixture: ReturnType<typeof realOnboardingHarness>;

  const input = {
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
    websiteUrl: 'https://acme.com',
  };

  beforeEach(() => {
    brandsService = {
      findOne: vi.fn().mockResolvedValue({
        agentConfig: {},
        description: 'Runs onboarding automation',
        id: 'brand-1',
        label: 'Acme',
      } as never),
      resolveBrandKitAssets: vi.fn().mockResolvedValue({ references: [] }),
      updateAgentConfig: vi.fn().mockResolvedValue(undefined),
    };
    postsService = {
      create: vi.fn().mockResolvedValue({ id: 'post-1' } as never),
    };
    llmDispatcherService = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [
          { message: { content: 'Acme ships onboarding automation.' } },
        ],
      } as never),
    };
    configService = { ingredientsEndpoint: 'https://cdn.genfeed.ai' };
    loggerService = { error: vi.fn(), warn: vi.fn() };
    generationGateway = {
      generateImage: vi.fn().mockResolvedValue({
        data: { id: 'ingredient-1', url: 'https://cdn.genfeed.ai/ad.png' },
      } as never),
    };

    harnessFixture = realOnboardingHarness();
    service = new OnboardingStarterAssetsService(
      loggerService as unknown as LoggerService,
      brandsService as unknown as BrandsService,
      postsService as unknown as PostsService,
      llmDispatcherService as unknown as LlmDispatcherService,
      configService as ConfigService,
      generationGateway as unknown as IAgentGenerationGateway,
      harnessFixture.harness,
    );
  });

  it('resolves fresh approved A/B identity and voice into the actual tweet request', async () => {
    for (const version of [1, 2]) {
      harnessFixture.findApproved.mockResolvedValueOnce(
        approvedOnboardingRevision(version),
      );
      await service.generate(input);
      const request =
        llmDispatcherService.chatCompletion.mock.calls.at(-1)?.[0];
      expect(request).toMatchObject({ max_tokens: 180, temperature: 0.4 });
      const prompt = request?.messages
        .map((message) => message.content)
        .join('\n');
      expect(prompt).toContain(`Approved identity ${version}`);
      expect(prompt).toContain(`Approved offering ${version}`);
      expect(prompt).toContain(`Distinctive voice ${version}`);
      expect(prompt).not.toContain('Conflicting legacy');
      expect(prompt).not.toContain('Website:');
    }
    expect(harnessFixture.findApproved).toHaveBeenNthCalledWith(
      1,
      'org-1',
      'brand-1',
    );
    expect(harnessFixture.findApproved).toHaveBeenNthCalledWith(
      2,
      'org-1',
      'brand-1',
    );
    expect(harnessFixture.findOne).toHaveBeenCalledWith({
      id: 'brand-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
  });

  it('uses saved voice through the real harness when no approved revision exists', async () => {
    harnessFixture.findApproved.mockResolvedValueOnce(null);
    await service.generate(input);
    const prompt = llmDispatcherService.chatCompletion.mock.calls[0][0].messages
      .map((message) => message.content)
      .join('\n');
    expect(prompt).toContain('Saved fallback voice');
    expect(prompt).toContain('Conflicting legacy label');
    expect(prompt).not.toContain('Approved identity');
  });

  it.each(['null', 'empty', 'oversized', 'throwing'] as const)(
    'does not dispatch text for %s required context and retains the image-only draft',
    async (mode) => {
      if (mode === 'null')
        vi.spyOn(harnessFixture.harness, 'resolveBrief').mockResolvedValue(
          null,
        );
      if (mode === 'empty')
        vi.spyOn(harnessFixture.harness, 'formatBrief').mockReturnValue('   ');
      if (mode === 'oversized')
        vi.spyOn(harnessFixture.harness, 'formatBrief').mockReturnValue(
          'x'.repeat(BRAND_CONTEXT_CHARACTER_BUDGET + 1),
        );
      if (mode === 'throwing')
        vi.spyOn(harnessFixture.harness, 'resolveBrief').mockRejectedValue(
          new Error('Unavailable'),
        );
      const result = await service.generate(input);
      expect(llmDispatcherService.chatCompletion).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        adImageUrl: 'https://cdn.genfeed.ai/ad.png',
        postId: 'post-1',
        tweet: null,
      });
      expect(postsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ ingredients: ['ingredient-1'] }),
      );
    },
  );

  it('rejects an all-empty result and records the failed job marker without saving a post', async () => {
    llmDispatcherService.chatCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: ' ' } }],
    } as never);
    generationGateway.generateImage.mockResolvedValueOnce({
      data: { id: 'unusable-image' },
    } as never);
    await expect(service.generateForJob(input)).rejects.toThrow(
      'No onboarding draft could be generated. Please retry.',
    );
    expect(postsService.create).not.toHaveBeenCalled();
    expect(
      brandsService.updateAgentConfig.mock.calls.at(-1)?.[2],
    ).toMatchObject({
      onboardingStarterAssets: {
        status: 'failed',
        error: 'No onboarding draft could be generated. Please retry.',
      },
    });
  });

  it('drafts a tweet and an ad, then saves a single post draft', async () => {
    const result = await service.generate(input);

    expect(result.tweet).toBe('Acme ships onboarding automation.');
    expect(result.postId).toBe('post-1');
    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        description: 'Acme ships onboarding automation.',
        organizationId: 'org-1',
      }),
    );
    const generateImageCall = generationGateway.generateImage.mock.calls[0][0];
    expect(generateImageCall).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          autoSelectModel: false,
          model: LOWEST_COST_IMAGE_MODEL_KEY,
          prioritize: RouterPriority.COST,
        }),
      }),
    );
    expect(generateImageCall.body).not.toHaveProperty('references');
  });

  it('passes brand-kit visuals as image references', async () => {
    brandsService.resolveBrandKitAssets.mockResolvedValueOnce({
      banner: { id: 'banner-1', role: 'banner', url: 'https://cdn/b' },
      logo: { id: 'logo-1', role: 'logo', url: 'https://cdn/l' },
      references: [{ id: 'ref-1', role: 'reference', url: 'https://cdn/r' }],
    } as never);

    await service.generate(input);

    expect(generationGateway.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          autoSelectModel: false,
          references: ['ref-1', 'logo-1', 'banner-1'],
        }),
      }),
    );
  });

  it('still generates the ad when brand-kit lookup fails', async () => {
    brandsService.resolveBrandKitAssets.mockRejectedValueOnce(
      new Error('kit unavailable'),
    );

    const result = await service.generate(input);

    expect(result.adImageUrl).toBe('https://cdn.genfeed.ai/ad.png');
    expect(loggerService.warn).toHaveBeenCalled();
    expect(
      generationGateway.generateImage.mock.calls[0][0].body,
    ).not.toHaveProperty('references');
  });

  it('throws when the brand does not belong to the organization', async () => {
    brandsService.findOne.mockResolvedValueOnce(null as never);

    await expect(service.generate(input)).rejects.toThrow();
  });

  it('survives a tweet failure and still saves the ad-only draft', async () => {
    llmDispatcherService.chatCompletion.mockRejectedValueOnce(
      new Error('LLM unavailable'),
    );

    const result = await service.generate(input);

    expect(result.tweet).toBeNull();
    expect(result.adImageUrl).toBe('https://cdn.genfeed.ai/ad.png');
    expect(loggerService.warn).toHaveBeenCalled();
  });

  it('survives an ad failure and still saves the tweet-only draft', async () => {
    generationGateway.generateImage.mockRejectedValueOnce(
      new Error('generation unavailable'),
    );

    const result = await service.generate(input);

    expect(result.tweet).toBe('Acme ships onboarding automation.');
    expect(result.adImageUrl).toBeNull();
  });

  describe('generateForJob', () => {
    it('writes a completed marker on the brand after a successful run', async () => {
      await service.generateForJob(input);

      const markerCalls = brandsService.updateAgentConfig.mock.calls;
      const lastCall = markerCalls[markerCalls.length - 1];
      expect(lastCall).toBeDefined();
      const [markerBrandId, markerOrgId, markerConfig] = lastCall ?? [];
      expect(markerBrandId).toBe('brand-1');
      expect(markerOrgId).toBe('org-1');
      expect(
        (markerConfig as Record<string, unknown>).onboardingStarterAssets,
      ).toMatchObject({ status: 'completed' });
    });

    it('writes a failed marker and rethrows when generation throws', async () => {
      const validBrand = {
        agentConfig: {},
        description: 'Runs onboarding automation',
        id: 'brand-1',
        label: 'Acme',
      } as never;
      // Call order: writeMarker('running') looks the brand up, then
      // generate() looks it up again (made to fail here), then the catch
      // block's writeMarker('failed') looks it up a third time to persist
      // the failure — each of those is a real `findOne` call in sequence.
      brandsService.findOne
        .mockResolvedValueOnce(validBrand)
        .mockResolvedValueOnce(null as never)
        .mockResolvedValueOnce(validBrand);

      await expect(service.generateForJob(input)).rejects.toThrow();

      const markerCalls = brandsService.updateAgentConfig.mock.calls;
      const lastCall = markerCalls[markerCalls.length - 1];
      expect(lastCall).toBeDefined();
      const [, , markerConfig] = lastCall ?? [];
      expect(
        (markerConfig as Record<string, unknown>).onboardingStarterAssets,
      ).toMatchObject({ status: 'failed' });
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
