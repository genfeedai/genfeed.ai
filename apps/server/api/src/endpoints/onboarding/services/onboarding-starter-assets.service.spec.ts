import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import {
  clampOnboardingTweet,
  OnboardingStarterAssetsService,
} from '@api/endpoints/onboarding/services/onboarding-starter-assets.service';
import type { IAgentGenerationGateway } from '@api/services/agent-orchestrator/gateway/agent-generation-gateway.interface';
import type { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    Pick<BrandsService, 'findOne' | 'updateAgentConfig'>
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

    service = new OnboardingStarterAssetsService(
      loggerService as unknown as LoggerService,
      brandsService as unknown as BrandsService,
      postsService as unknown as PostsService,
      llmDispatcherService as unknown as LlmDispatcherService,
      configService as ConfigService,
      generationGateway as unknown as IAgentGenerationGateway,
    );
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
