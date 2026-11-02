import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { buildVoiceCorpus } from '@api/collections/brands/utils/brand-voice-corpus.util';
import { OnboardingFirstDraftsService } from '@api/endpoints/onboarding/services/onboarding-first-drafts.service';
import { InsufficientCreditsException } from '@api/exceptions/business-logic.exception';
import { createInsufficientCreditsException } from '@api/helpers/utils/credits/insufficient-credits.util';
import { ONBOARDING_CAMPAIGN_IMAGE_SLOTS } from '@genfeedai/contracts/constants';
import type {
  IOnboardingCampaignImage,
  IOnboardingFirstDraftsResult,
} from '@genfeedai/contracts/interfaces';
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
  const gateway = { generateImage: vi.fn() };
  const runs = { execute: vi.fn(), retryMedia: vi.fn() };
  const voiceCorpus = { buildCorpus: vi.fn() };

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
      runs as never,
      voiceCorpus as never,
    );
    voiceCorpus.buildCorpus.mockResolvedValue({ samples: [] });
    runs.execute.mockImplementation(
      async (_user, _brand, _previous, generate) => generate(vi.fn()),
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
    it('drafts all four channels with a master image and one image per platform slot', async () => {
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
      expect(
        result.campaignImages?.map((image) => [image.id, image.status]),
      ).toEqual([
        ['twitter', 'ready'],
        ['instagram', 'ready'],
        ['linkedin', 'ready'],
        ['tiktok-1', 'ready'],
        ['tiktok-2', 'ready'],
      ]);
      expect(gateway.generateImage).toHaveBeenCalledTimes(6);
    });

    it('derives each platform image from the master at that platform size', async () => {
      await service.generate(user, 'brand_1', {});

      const bodies = vi
        .mocked(buildFirstRunOnboardingImageBody)
        .mock.calls.map(([input]) => input);
      expect(bodies[0].leadingReferenceIds).toBeUndefined();
      expect(
        bodies
          .slice(1)
          .map((input) => [
            input.leadingReferenceIds,
            input.width,
            input.height,
          ]),
      ).toEqual([
        [['ing_1'], 1024, 576],
        [['ing_1'], 1024, 1280],
        [['ing_1'], 1024, 576],
        [['ing_1'], 576, 1024],
        [['ing_1'], 576, 1024],
      ]);
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

    describe('imported posts', () => {
      function importedPost(
        id: string,
        text: string,
        kind: 'original' | 'reply',
      ) {
        return {
          engagement: null,
          id,
          kind,
          origin: 'own-account' as const,
          platform: 'twitter',
          publishedAt: '2026-10-20T10:00:00.000Z',
          text,
        };
      }

      it("quotes the brand's imported posts in every channel's draft", async () => {
        voiceCorpus.buildCorpus.mockResolvedValue(
          buildVoiceCorpus([
            importedPost(
              'src-1',
              'shipped the new editor. no fluff.',
              'original',
            ),
            importedPost('src-2', '@sam thanks, fixing it today', 'reply'),
          ]),
        );

        await service.generate(user, 'brand_1', {});

        expect(voiceCorpus.buildCorpus).toHaveBeenCalledTimes(1);
        const evidence = postGeneration.generateDraftText.mock.calls.map(
          ([, , , options]) => options.voiceEvidence as string,
        );
        expect(evidence).toHaveLength(4);
        for (const block of evidence) {
          expect(block).toContain('shipped the new editor. no fluff.');
          expect(block).not.toContain('thanks, fixing it today');
        }
      });

      it('falls back to replies when the account has no original posts', async () => {
        voiceCorpus.buildCorpus.mockResolvedValue(
          buildVoiceCorpus([
            importedPost('src-2', '@sam thanks, fixing it today', 'reply'),
          ]),
        );

        await service.generate(user, 'brand_1', {});

        const [, , , options] = postGeneration.generateDraftText.mock.calls[0];
        expect(options.voiceEvidence).toContain('thanks, fixing it today');
      });

      it('drafts from the brand kit alone when nothing was imported', async () => {
        voiceCorpus.buildCorpus.mockResolvedValue(buildVoiceCorpus([]));

        const result = await service.generate(user, 'brand_1', {});

        expect(result.drafts).toHaveLength(4);
        for (const [, , , options] of postGeneration.generateDraftText.mock
          .calls) {
          expect(options).not.toHaveProperty('voiceEvidence');
        }
      });

      it('still drafts when the imported posts cannot be read', async () => {
        voiceCorpus.buildCorpus.mockRejectedValue(new Error('db down'));

        const result = await service.generate(user, 'brand_1', {});

        expect(result.drafts).toHaveLength(4);
        expect(logger.warn).toHaveBeenCalledWith(
          'Onboarding drafts skipped voice evidence',
          { brandId: 'brand_1', error: 'db down' },
        );
      });
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
      expect(result.campaignImages?.map((image) => image.status)).toEqual([
        'failed',
        'failed',
        'failed',
        'failed',
        'failed',
      ]);
      expect(gateway.generateImage).toHaveBeenCalledTimes(1);
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
  it('keeps the master and the other images when one platform image fails', async () => {
    gateway.generateImage
      .mockResolvedValueOnce({ data: { id: 'ing_master' } })
      .mockRejectedValueOnce(new Error('provider failed'));
    const result = await service.generate(user, 'brand_1', {});
    expect(result.campaignImages?.map((image) => image.status)).toEqual([
      'failed',
      'ready',
      'ready',
      'ready',
      'ready',
    ]);
    expect(result.imageIngredientId).toBe('ing_master');
    expect(result.drafts).toHaveLength(4);
    expect(result.status).toBe('partial');
  });

  describe.each([
    [
      'a deferred-credits payment error',
      () => createInsufficientCreditsException(12, 0),
    ],
    [
      'an insufficient-credits business error',
      () => new InsufficientCreditsException(12, 0),
    ],
  ])(
    'when the organization cannot pay for an image (%s)',
    (_label, buildError) => {
      it('stops after the images it can pay for and marks the rest needs_credits', async () => {
        gateway.generateImage
          .mockResolvedValueOnce({ data: { id: 'ing_master' } })
          .mockResolvedValueOnce({ data: { id: 'ing_twitter' } })
          .mockImplementationOnce(
            async (input: {
              onPlaceholderCreated: (id: string) => Promise<void>;
            }) => {
              await input.onPlaceholderCreated('placeholder');
              throw buildError();
            },
          );
        const result = await service.generate(user, 'brand_1', {});
        expect(
          result.campaignImages?.map((image) => [
            image.id,
            image.status,
            image.ingredientId,
          ]),
        ).toEqual([
          ['twitter', 'ready', 'ing_twitter'],
          ['instagram', 'needs_credits', null],
          ['linkedin', 'needs_credits', null],
          ['tiktok-1', 'needs_credits', null],
          ['tiktok-2', 'needs_credits', null],
        ]);
        expect(gateway.generateImage).toHaveBeenCalledTimes(3);
        expect(result.imageIngredientId).toBe('ing_master');
        expect(result.drafts).toHaveLength(4);
        expect(result.status).toBe('partial');
      });

      it('marks every platform image needs_credits when even the master is unaffordable', async () => {
        gateway.generateImage.mockRejectedValueOnce(buildError());
        const result = await service.generate(user, 'brand_1', {});
        expect(result.imageUrl).toBeNull();
        expect(result.campaignImages?.map((image) => image.status)).toEqual([
          'needs_credits',
          'needs_credits',
          'needs_credits',
          'needs_credits',
          'needs_credits',
        ]);
        expect(gateway.generateImage).toHaveBeenCalledTimes(1);
        expect(logger.error).not.toHaveBeenCalled();
      });
    },
  );

  describe('retryMedia', () => {
    const readyImage = (
      slot: (typeof slots)[number],
    ): IOnboardingCampaignImage => ({
      aspectRatio: slot.aspectRatio,
      id: slot.id,
      ingredientId: `ing_${slot.id}`,
      platform: slot.platform,
      status: 'ready',
      url: `https://cdn.example.com/${slot.id}.png`,
    });
    const slots = ONBOARDING_CAMPAIGN_IMAGE_SLOTS;
    const saved = (
      overrides: Partial<IOnboardingFirstDraftsResult> = {},
    ): IOnboardingFirstDraftsResult => ({
      drafts: (['twitter', 'instagram', 'tiktok', 'linkedin'] as const).map(
        (platform, index) => ({
          isProvisional: false,
          platform,
          postId: `post_${index}`,
          receiptId: `receipt_${index}`,
          requestKey: `key_${index}`,
          text: `${platform} saved text`,
        }),
      ),
      campaignImages: [],
      imageIngredientId: null,
      imageUrl: null,
      requestKey: 'key_0',
      status: 'partial',
      ...overrides,
    });
    const run = (
      missing: { campaign: boolean; image: boolean },
      result = saved(),
    ) => {
      runs.retryMedia.mockImplementation(async (_user, _brand, generate) =>
        generate(missing, result, vi.fn()),
      );
      return service.retryMedia(user, 'brand_1');
    };

    it('regenerates a missing master and its platform images without writing any text again', async () => {
      const result = await run({ campaign: true, image: true });
      expect(postGeneration.generateDraftText).not.toHaveBeenCalled();
      expect(gateway.generateImage).toHaveBeenCalledTimes(6);
      expect(result.drafts.map((draft) => draft.text)).toEqual([
        'twitter saved text',
        'instagram saved text',
        'tiktok saved text',
        'linkedin saved text',
      ]);
      expect(result.imageIngredientId).toBe('ing_1');
      expect(result.status).toBe('ready');
    });

    it('derives the new platform images from a master that already exists', async () => {
      await run(
        { campaign: true, image: false },
        saved({
          imageIngredientId: 'ing_master',
          imageUrl: 'https://cdn.example.com/master.png',
        }),
      );
      expect(gateway.generateImage).toHaveBeenCalledTimes(5);
      expect(
        vi
          .mocked(buildFirstRunOnboardingImageBody)
          .mock.calls.map(([input]) => input.leadingReferenceIds),
      ).toEqual(Array(5).fill(['ing_master']));
    });

    it('keeps the platform images that already came back', async () => {
      const result = await run(
        { campaign: true, image: false },
        saved({
          campaignImages: [readyImage(slots[0]), readyImage(slots[1])],
          imageIngredientId: 'ing_master',
          imageUrl: 'https://cdn.example.com/master.png',
        }),
      );
      expect(gateway.generateImage).toHaveBeenCalledTimes(3);
      expect(result.campaignImages?.[0].ingredientId).toBe('ing_twitter');
      expect(result.status).toBe('ready');
    });

    it('generates the images that needed credits once the wallet can pay', async () => {
      const result = await run(
        { campaign: true, image: false },
        saved({
          campaignImages: slots.map((slot) => ({
            aspectRatio: slot.aspectRatio,
            id: slot.id,
            ingredientId: null,
            platform: slot.platform,
            status: 'needs_credits' as const,
            url: null,
          })),
          imageIngredientId: 'ing_master',
          imageUrl: 'https://cdn.example.com/master.png',
        }),
      );
      expect(
        result.campaignImages?.every((image) => image.status === 'ready'),
      ).toBe(true);
    });

    it('stays partial and keeps the drafts when the master fails again', async () => {
      gateway.generateImage.mockRejectedValueOnce(new Error('provider failed'));
      const result = await run({ campaign: true, image: true });
      expect(result.imageUrl).toBeNull();
      expect(result.drafts).toHaveLength(4);
      expect(result.status).toBe('partial');
    });

    it('scopes the brand lookup to the caller organization', async () => {
      await run({ campaign: false, image: true });
      expect(brandsService.findOne).toHaveBeenCalledWith(
        { id: 'brand_1', isDeleted: false, organizationId: 'org_1' },
        'none',
      );
    });
  });
});
