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
    readUsableCdnAssetUrl: vi.fn(),
    toMediaResponseRecord: vi.fn((value: unknown) => value),
  }),
);

import { readUsableCdnAssetUrl } from '@api/services/agent-orchestrator/tools/agent-media-generation-response-readers';

describe('OnboardingFirstDraftsService', () => {
  const user = { id: 'user_1', organizationId: 'org_1' } as unknown as User;

  const logger = { error: vi.fn(), warn: vi.fn() };
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
    gateway.generateImage.mockResolvedValue({ url: 'x' });
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

    it('is partial when the image fails', async () => {
      gateway.generateImage.mockRejectedValue(new Error('no key'));

      const result = await service.generate(user, 'brand_1', {});

      expect(result.status).toBe('partial');
      expect(result.imageUrl).toBeNull();
      expect(result.drafts).toHaveLength(4);
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
});
