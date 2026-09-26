import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandSetupService } from '@api/collections/brands/services/brand-setup.service';
import type { BrandSetupDto } from '@api/endpoints/onboarding/dto/brand-setup.dto';
import { BrandScrapeErrorCode } from '@genfeedai/contracts';
import { HttpException } from '@nestjs/common';

function buildService(
  overrides: {
    scrapeWebsite?: ReturnType<typeof vi.fn>;
    updateBrandWithScrapedData?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const brandScraperService = {
    detectUrlType: vi.fn().mockReturnValue({ websiteUrl: 'https://acme.com' }),
    scrapeAllSources: vi.fn(),
    scrapeLinkedIn: vi.fn(),
    scrapeWebsite:
      overrides.scrapeWebsite ??
      vi.fn().mockResolvedValue({
        companyName: 'Acme',
        scrapedAt: new Date(),
        sourceUrl: 'https://acme.com',
      }),
    scrapeXProfile: vi.fn(),
    validateUrl: vi.fn().mockReturnValue({ isValid: true }),
  };
  const masterPromptGeneratorService = {
    analyzeBrandVoice: vi.fn().mockResolvedValue(undefined),
  };
  const brandsService = {
    findOne: vi.fn().mockResolvedValue({
      id: 'brand-1',
      label: 'Acme',
      organizationId: 'org-1',
    }),
  };
  const onboardingCreditGrantsService = {
    completeMissions: vi.fn().mockResolvedValue(undefined),
  };
  const organizationSettingsService = {
    findOne: vi
      .fn()
      .mockResolvedValue({ id: 'settings-1', isFirstLogin: true }),
    patch: vi.fn().mockResolvedValue(undefined),
  };
  const brandDataMapper = {
    buildFallbackScrapedData: vi.fn().mockReturnValue({
      companyName: 'Acme',
      scrapedAt: new Date(),
      sourceUrl: 'https://acme.com',
    }),
    mapLinkedInData: vi.fn(),
    mapMergedSources: vi.fn(),
    mapXProfileData: vi.fn(),
  };
  const brandPersistenceService = {
    autofillScrapedBrandAssets: vi.fn().mockResolvedValue(undefined),
    syncBrandAndOrgSlug: vi.fn().mockResolvedValue(undefined),
    updateBrandGuidance: vi.fn().mockResolvedValue(undefined),
    updateBrandWithScrapedData:
      overrides.updateBrandWithScrapedData ??
      vi.fn().mockResolvedValue(undefined),
    upsertBrandSocialLinks: vi.fn().mockResolvedValue(undefined),
    upsertBrandWebsiteLink: vi.fn().mockResolvedValue(undefined),
  };

  const service = new BrandSetupService(
    loggerService as never,
    brandScraperService as never,
    masterPromptGeneratorService as never,
    brandsService as never,
    onboardingCreditGrantsService as never,
    organizationSettingsService as never,
    brandDataMapper as never,
    brandPersistenceService as never,
  );

  return { brandScraperService, loggerService, service };
}

const user = { id: 'user-1', userId: 'user-1' } as unknown as User;
const dto: BrandSetupDto = { brandUrl: 'https://acme.com' };

describe('BrandSetupService.setupBrand — brand-scrape error classification (#5080)', () => {
  it('rejects an invalid URL with a stable, non-generic code', async () => {
    const { service, brandScraperService } = buildService();
    brandScraperService.validateUrl.mockReturnValue({
      error: 'Invalid domain',
      isValid: false,
    });

    await expect(
      service.setupBrand('brand-1', dto, user),
    ).rejects.toMatchObject({
      response: {
        code: BrandScrapeErrorCode.INVALID_URL,
        detail: 'Invalid domain',
        title: 'Invalid URL',
      },
      status: 400,
    });
  });

  it('completes setup with a classified, non-blocking warning when the site is unreachable', async () => {
    const notFound = new TypeError('fetch failed');
    (notFound as unknown as { cause: { code: string } }).cause = {
      code: 'ENOTFOUND',
    };
    const { service } = buildService({
      scrapeWebsite: vi.fn().mockRejectedValue(notFound),
    });

    const result = await service.setupBrand('brand-1', dto, user);

    expect(result.success).toBe(true);
    expect(result.scrapeWarning).toEqual({
      code: BrandScrapeErrorCode.SITE_UNREACHABLE,
      message: 'We could not reach that website.',
    });
  });

  it('completes setup without a warning when the scrape succeeds with content', async () => {
    const { service } = buildService();

    const result = await service.setupBrand('brand-1', dto, user);

    expect(result.success).toBe(true);
    expect(result.scrapeWarning).toBeUndefined();
  });

  it('returns a safe generic 500 with a stable code for an unexpected failure, without leaking internal detail', async () => {
    const { service, loggerService } = buildService({
      updateBrandWithScrapedData: vi
        .fn()
        .mockRejectedValue(
          new Error(
            'duplicate key value violates constraint acme_secret_index',
          ),
        ),
    });

    await expect(
      service.setupBrand('brand-1', dto, user),
    ).rejects.toMatchObject({
      response: {
        code: BrandScrapeErrorCode.UNKNOWN,
        detail: 'Failed to setup brand',
        title: 'Brand Setup Failed',
      },
      status: 500,
    });

    // Diagnostics are still protected server-side, just not echoed to the client.
    expect(loggerService.error).toHaveBeenCalledWith(
      expect.stringContaining('failed'),
      expect.objectContaining({
        message: expect.stringContaining('acme_secret_index'),
      }),
    );
  });

  it('rejects with an HttpException instance for the invalid-URL case', async () => {
    const { service, brandScraperService } = buildService();
    brandScraperService.validateUrl.mockReturnValue({
      error: 'Invalid domain',
      isValid: false,
    });

    await expect(
      service.setupBrand('brand-1', dto, user),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
