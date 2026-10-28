import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OnboardingFirstDraftsService } from '@api/endpoints/onboarding/services/onboarding-first-drafts.service';
import { BadRequestException } from '@nestjs/common';

vi.mock(
  '@api/helpers/utils/first-run-image-generation/first-run-image-generation.util',
  () => ({
    buildFirstRunOnboardingImageBody: vi.fn().mockResolvedValue({}),
  }),
);
vi.mock(
  '@api/services/agent-orchestrator/tools/agent-media-generation-response-readers',
  () => ({
    readMediaResponseString: vi.fn(
      (value: { data?: { id?: string } }) => value.data?.id,
    ),
    readUsableCdnAssetUrl: vi.fn(),
    toMediaResponseRecord: vi.fn((value: unknown) => value),
  }),
);

import { buildFirstRunOnboardingImageBody } from '@api/helpers/utils/first-run-image-generation/first-run-image-generation.util';
import { readUsableCdnAssetUrl } from '@api/services/agent-orchestrator/tools/agent-media-generation-response-readers';

describe('OnboardingFirstDraftsService', () => {
  const user = { id: 'user_1', organizationId: 'org_1' } as unknown as User;

  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const config = {
    get: vi.fn().mockReturnValue('test'),
    ingredientsEndpoint: 'https://cdn.example.com',
  };
  const brandsService = {
    findOne: vi.fn(),
    resolveBrandKitAssets: vi.fn(),
    updateAgentConfig: vi.fn(),
  };
  const brandDataMapper = {
    readBrandAgentConfig: vi.fn().mockReturnValue({}),
  };
  const postGeneration = { generateDraftText: vi.fn() };
  const signupPrefill = { scanBrandUrl: vi.fn() };
  const gateway = { generateImage: vi.fn(), generateVideo: vi.fn() };

  let service: OnboardingFirstDraftsService;
  let counter = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    counter = 0;
    brandsService.findOne.mockResolvedValue({
      agentConfig: {},
      description: 'Scheduling for creators',
      label: 'Acme',
    });
    postGeneration.generateDraftText.mockImplementation(
      async (input: { platform: string }) => {
        counter += 1;
        return {
          brandedReceipt: { id: `receipt_${counter}`, state: 'ready' },
          description: `${input.platform} draft`,
          postId: `post_${counter}`,
        };
      },
    );
    gateway.generateVideo.mockResolvedValue({ data: { id: 'video_1' } });
    gateway.generateImage.mockResolvedValue({
      data: { id: 'ing_1' },
      url: 'x',
    });
    vi.mocked(readUsableCdnAssetUrl).mockReturnValue(
      'https://cdn.example.com/a.png',
    );
    service = new OnboardingFirstDraftsService(
      logger as never,
      config as never,
      brandsService as never,
      brandDataMapper as never,
      postGeneration as never,
      signupPrefill as never,
      gateway as never,
      {
        execute: vi.fn(async (_user, _brand, _previous, generate) =>
          generate(vi.fn()),
        ),
      } as never,
    );
  });

  describe('scan', () => {
    it('returns the scanned summary', async () => {
      signupPrefill.scanBrandUrl.mockResolvedValue({
        scrapeStatus: 'scraped',
        summary: { name: 'Acme' },
      });

      await expect(service.scan(user, 'brand_1', 'acme.co')).resolves.toEqual({
        status: 'scanned',
        summary: { name: 'Acme' },
      });
      expect(signupPrefill.scanBrandUrl).toHaveBeenCalledWith(
        { brandId: 'brand_1', organizationId: 'org_1', userId: 'user_1' },
        expect.stringContaining('acme.co'),
      );
    });

    it('logs each scan outcome so the onboarding funnel can be counted', async () => {
      signupPrefill.scanBrandUrl.mockResolvedValue({
        scrapeReason: 'blocked',
        scrapeStatus: 'failed',
      });

      await service.scan(user, 'brand_1', 'acme.co');

      expect(logger.log).toHaveBeenCalledWith('Onboarding brand scan', {
        brandId: 'brand_1',
        outcome: 'failed',
        reason: 'blocked',
      });
    });

    it('reports an unreadable page instead of throwing', async () => {
      signupPrefill.scanBrandUrl.mockResolvedValue({
        scrapeReason: 'blocked',
        scrapeStatus: 'failed',
      });

      await expect(service.scan(user, 'brand_1', 'acme.co')).resolves.toEqual({
        reason: 'blocked',
        status: 'failed',
      });
    });

    it('maps a rejected link to a stable reason', async () => {
      signupPrefill.scanBrandUrl.mockRejectedValue(
        new BadRequestException('bad'),
      );

      await expect(service.scan(user, 'brand_1', 'acme.co')).resolves.toEqual({
        reason: 'invalid_url',
        status: 'failed',
      });
    });
  });

  describe('generate', () => {
    it('drafts all four channels with one shared image', async () => {
      const result = await service.generate(user, 'brand_1', {});

      expect(result.status).toBe('ready');
      expect(result.drafts.map((draft) => draft.platform)).toEqual([
        'twitter',
        'instagram',
        'tiktok',
        'linkedin',
      ]);
      expect(result.imageUrl).toBe('https://cdn.example.com/a.png');
      expect(result.imageIngredientId).toBe('ing_1');
      expect(result.requestKey).toBe(result.drafts[0]?.requestKey);
      expect(gateway.generateImage).toHaveBeenCalledTimes(1);
    });

    it('writes the other channels from the X post, which is drafted first', async () => {
      await service.generate(user, 'brand_1', {});

      const prompts = postGeneration.generateDraftText.mock.calls.map(
        ([input]) => input.prompt as string,
      );
      expect(prompts).toHaveLength(4);
      for (const prompt of prompts.slice(1)) {
        expect(prompt).toContain('twitter draft');
      }
    });

    it('saves the retry round context and links the regeneration', async () => {
      await service.generate(user, 'brand_1', {
        context: { audience: 'Founders', offer: 'A tool', tone: 'casual' },
        previousRequestKey: '3f6b1e0a-2b8c-4f06-9d34-5a0f8c1d2e7b',
      });

      expect(brandsService.updateAgentConfig).toHaveBeenCalledWith(
        'brand_1',
        'org_1',
        expect.objectContaining({
          strategy: expect.objectContaining({ offers: ['A tool'] }),
        }),
      );
      const [, , , options] = postGeneration.generateDraftText.mock.calls[0];
      expect(options).toEqual({
        parentRequestId: '3f6b1e0a-2b8c-4f06-9d34-5a0f8c1d2e7b',
        surface: 'onboarding',
      });
    });

    it('sends the image a structured brief, not the form answers', async () => {
      brandsService.findOne.mockResolvedValue({
        agentConfig: {},
        description: 'Content brand for Acme.',
        label: 'Acme',
      });
      postGeneration.generateDraftText.mockImplementation(
        async (input: { platform: string }) => ({
          brandedReceipt: { id: 'receipt', state: 'ready' },
          description:
            input.platform === 'twitter'
              ? 'I build AI agents that automate follow-ups. Follow along. 🤖'
              : 'draft',
          postId: 'post',
        }),
      );

      await service.generate(user, 'brand_1', {
        context: { audience: 'Aryan', goals: ['Grow my audience'] },
      });

      const [input] = vi.mocked(buildFirstRunOnboardingImageBody).mock.calls[0];
      expect(input.prompt).toBe('I build AI agents that automate follow-ups');
      expect(input.slots).toMatchObject({
        camera: expect.any(String),
        lens: expect.any(String),
        lighting: expect.any(String),
        subject: expect.stringContaining('connected nodes'),
      });
      expect(JSON.stringify(input)).not.toMatch(
        /Content brand for|Write for this audience|Aryan/,
      );
    });

    it('is partial when the image fails', async () => {
      gateway.generateImage.mockRejectedValue(new Error('no key'));

      const result = await service.generate(user, 'brand_1', {});

      expect(result.status).toBe('partial');
      expect(result.imageUrl).toBeNull();
      expect(result.drafts).toHaveLength(4);
      expect(logger.error).toHaveBeenCalledWith(
        'Onboarding image generation failed',
        expect.any(Error),
        { brandId: 'brand_1' },
      );
    });

    it('is partial when one channel fails', async () => {
      postGeneration.generateDraftText.mockImplementation(
        async (input: { platform: string }) => {
          if (input.platform === 'linkedin') throw new Error('boom');
          counter += 1;
          return {
            brandedReceipt: { id: `receipt_${counter}`, state: 'ready' },
            description: 'draft',
            postId: `post_${counter}`,
          };
        },
      );

      const result = await service.generate(user, 'brand_1', {});

      expect(result.status).toBe('partial');
      expect(result.drafts).toHaveLength(3);
    });

    it('is unavailable when the X draft cannot be written', async () => {
      postGeneration.generateDraftText.mockRejectedValue(new Error('no key'));

      await expect(service.generate(user, 'brand_1', {})).resolves.toEqual({
        drafts: [],
        imageIngredientId: null,
        imageUrl: null,
        requestKey: null,
        status: 'unavailable',
      });
      expect(gateway.generateImage).not.toHaveBeenCalled();
    });

    it('scopes the brand lookup to the caller organization', async () => {
      await service.generate(user, 'brand_1', {});

      expect(brandsService.findOne).toHaveBeenCalledWith(
        { id: 'brand_1', isDeleted: false, organizationId: 'org_1' },
        'none',
      );
    });
  });
  it('creates a short cost-priority video through the normal billing gateway', async () => {
    const result = await service.generate(user, 'brand_1', {});
    expect(gateway.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        principal: {
          brandId: 'brand_1',
          organizationId: 'org_1',
          userId: 'user_1',
        },
        body: expect.objectContaining({
          brandId: 'brand_1',
          duration: 5,
          prioritize: 'cost',
          waitForCompletion: true,
          references: ['ing_1'],
        }),
      }),
    );
    expect(result.videoIngredientId).toBe('video_1');
    expect(result.videoUrl).toBeTruthy();
  });
  it('keeps every saved image and text draft if video rendering fails', async () => {
    gateway.generateVideo.mockRejectedValueOnce(new Error('provider failed'));
    const result = await service.generate(user, 'brand_1', {});
    expect(result.videoStatus).toBe('failed');
    expect(result.drafts).toHaveLength(4);
    expect(result.imageIngredientId).toBe('ing_1');
    expect(result.status).toBe('partial');
  });
});
