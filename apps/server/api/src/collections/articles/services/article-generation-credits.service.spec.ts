vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import {
  ArticleGenerationType,
  type GenerateArticlesDto,
} from '@api/collections/articles/dto/generate-articles.dto';
import { ArticleGenerationCreditsService } from '@api/collections/articles/services/article-generation-credits.service';
import { TextGenerationCreditsService } from '@api/services/byok/text-generation-credits.service';
import { ByokProvider } from '@genfeedai/contracts';
import type { Request } from 'express';

const OPENROUTER_MODEL = 'anthropic/claude-sonnet-5';
const REPLICATE_MODEL = 'mistralai/mixtral-8x7b-instruct-v0.1';

type CreditsRequest = {
  creditsConfig?: { deferred?: boolean; isByokBypass?: boolean };
};

function deferredRequest(): CreditsRequest {
  return { creditsConfig: { deferred: true } };
}

describe('ArticleGenerationCreditsService', () => {
  const articlesService = { resolveArticleCycleModelConfig: vi.fn() };
  const byokService = { resolveApiKey: vi.fn() };
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
  };
  const modelsService = {
    findOne: vi.fn().mockResolvedValue({ pricingType: 'per-token' }),
  };
  const service = new ArticleGenerationCreditsService(
    articlesService as never,
    creditsUtilsService as never,
    modelsService as never,
    new TextGenerationCreditsService(byokService as never),
  );

  beforeEach(() => {
    vi.clearAllMocks();
    articlesService.resolveArticleCycleModelConfig.mockResolvedValue({
      generationModel: OPENROUTER_MODEL,
      reviewModel: OPENROUTER_MODEL,
      updateModel: OPENROUTER_MODEL,
    });
    byokService.resolveApiKey.mockResolvedValue(undefined);
    creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
      true,
    );
  });

  describe('admitGeneration', () => {
    const dto = { prompt: 'BYOK' } as GenerateArticlesDto;

    it("bypasses the credit floor when the org's key pays for every step", async () => {
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'org-or-key' });
      const request = deferredRequest();

      const byok = await service.admitGeneration(
        request as unknown as Request,
        'org-1',
        dto,
      );

      expect(byok?.keys[ByokProvider.OPENROUTER]).toBe('org-or-key');
      expect(request.creditsConfig?.isByokBypass).toBe(true);
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).not.toHaveBeenCalled();
    });

    it('charges credits when an Admin-configured step dispatches natively without an org key', async () => {
      articlesService.resolveArticleCycleModelConfig.mockResolvedValue({
        generationModel: REPLICATE_MODEL,
        reviewModel: OPENROUTER_MODEL,
        updateModel: OPENROUTER_MODEL,
      });
      byokService.resolveApiKey.mockImplementation(
        async (_org: string, provider: ByokProvider) =>
          provider === ByokProvider.OPENROUTER
            ? { apiKey: 'org-or-key' }
            : undefined,
      );
      const request = deferredRequest();

      await expect(
        service.admitGeneration(request as unknown as Request, 'org-1', dto),
      ).resolves.toBeUndefined();

      expect(request.creditsConfig?.isByokBypass).toBeUndefined();
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith('org-1', 3);
    });

    it('requires a key for the header prompt model of an X article', async () => {
      articlesService.resolveArticleCycleModelConfig.mockResolvedValue({
        generationModel: REPLICATE_MODEL,
        reviewModel: REPLICATE_MODEL,
        updateModel: REPLICATE_MODEL,
      });
      byokService.resolveApiKey.mockImplementation(
        async (_org: string, provider: ByokProvider) =>
          provider === ByokProvider.REPLICATE
            ? { apiKey: 'org-r8-key' }
            : undefined,
      );

      await expect(
        service.admitGeneration(
          deferredRequest() as unknown as Request,
          'org-1',
          {
            ...dto,
            type: ArticleGenerationType.X_ARTICLE,
          } as GenerateArticlesDto,
        ),
      ).resolves.toBeUndefined();
      expect(byokService.resolveApiKey).toHaveBeenCalledWith(
        'org-1',
        ByokProvider.OPENROUTER,
      );
    });

    it('resolves the per-request model override before deciding', async () => {
      await service.admitGeneration(
        deferredRequest() as unknown as Request,
        'org-1',
        { ...dto, model: OPENROUTER_MODEL } as GenerateArticlesDto,
      );

      expect(
        articlesService.resolveArticleCycleModelConfig,
      ).toHaveBeenCalledWith('org-1', OPENROUTER_MODEL);
    });
  });

  describe('admitReview', () => {
    it('bypasses the review floor with the org key for the review model', async () => {
      articlesService.resolveArticleCycleModelConfig.mockResolvedValue({
        generationModel: OPENROUTER_MODEL,
        reviewModel: REPLICATE_MODEL,
        updateModel: OPENROUTER_MODEL,
      });
      byokService.resolveApiKey.mockResolvedValue({ apiKey: 'org-r8-key' });

      const byok = await service.admitReview(
        deferredRequest() as unknown as Request,
        'org-1',
      );

      expect(byokService.resolveApiKey).toHaveBeenCalledTimes(1);
      expect(byok?.keys).toEqual({ [ByokProvider.REPLICATE]: 'org-r8-key' });
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).not.toHaveBeenCalled();
    });

    it('keeps the review floor without an org key', async () => {
      await expect(
        service.admitReview(deferredRequest() as unknown as Request, 'org-1'),
      ).resolves.toBeUndefined();
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith('org-1', 1);
    });
  });
});
