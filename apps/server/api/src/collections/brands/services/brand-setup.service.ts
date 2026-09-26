import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';
import { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import { BrandPersistenceService } from '@api/collections/brands/services/brand-persistence.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { BrandSetupDto } from '@api/endpoints/onboarding/dto/brand-setup.dto';
import type { ReferenceImageDto } from '@api/endpoints/onboarding/dto/reference-images.dto';
import type { BrandSetupResponse } from '@api/endpoints/onboarding/onboarding.interfaces';
import { withOnboardingErrorHandling } from '@api/endpoints/onboarding/services/onboarding-error.util';
import {
  BRAND_SCRAPE_EMPTY_CONTENT_WARNING,
  classifyBrandScrapeError,
  isBrandScrapeContentEmpty,
} from '@api/services/brand-scraper/brand-scrape-error.util';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import { BrandScrapeErrorCode } from '@genfeedai/contracts';
import type {
  IBrandScrapeWarning,
  IBrandVoiceAnalysis,
  IExtractedBrandData,
  IScrapedBrandData,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * The scrape step always degrades to a fallback profile rather than failing
 * brand setup — see `scrapeBrandData` below. `warning` carries the classified,
 * stable reason for that degradation so it survives to the app instead of
 * being dropped after a server-side log line (#5080).
 */
interface ScrapeBrandDataResult {
  data: IScrapedBrandData;
  warning?: IBrandScrapeWarning;
}

/**
 * BrandSetupService
 *
 * The brand-setup orchestration (website/socials scrape → AI brand-voice
 * analysis → canonical guidance → label/slug sync → reward unlock →
 * first-login completion) plus the two related brand writes (rename-with-org
 * cascade, reference images).
 *
 * Dissolved out of the onboarding endpoint per REST audit #1354 and re-homed on
 * `BrandsModule` — the target resource's own module. The brand is addressed by
 * id in the route path (`POST /brands/:id/scrape`, `POST /brands/:id/reference-images`,
 * `PATCH /brands/:id { syncOrganizationName }`) and access is verified by the
 * controller before delegation, so the organization scope is read from the
 * resolved brand row rather than re-resolved from user context. This removes
 * the OnboardingModule ↔ BrandsModule/UsersModule import cycle: brand writes no
 * longer round-trip back through OnboardingService.
 */
@Injectable()
export class BrandSetupService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly brandScraperService: BrandScraperService,
    private readonly masterPromptGeneratorService: MasterPromptGeneratorService,
    private readonly brandsService: BrandsService,
    private readonly onboardingCreditGrantsService: OnboardingCreditGrantsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly brandDataMapper: BrandDataMapper,
    private readonly brandPersistenceService: BrandPersistenceService,
  ) {}

  /**
   * Resolve the target brand's organization scope from the row itself.
   * Access has already been verified by the controller (`verifyBrandAccess`),
   * so no user-context re-resolution is needed.
   */
  private async resolveBrandScope(brandId: string): Promise<{
    brandId: string;
    brandLabel: string | null;
    organizationId: string;
  }> {
    const brand = await this.brandsService.findOne({ id: brandId }, 'none');

    if (!brand) {
      throw new HttpException(
        { detail: 'Brand not found', title: 'Brand Not Found' },
        HttpStatus.NOT_FOUND,
      );
    }

    // Read scalar fields defensively — the Mongo-era `organization` alias is
    // undefined on Prisma rows (see docs/identity-resolution.md).
    const record = brand as unknown as {
      id?: unknown;
      label?: unknown;
      organizationId?: unknown;
    };
    const resolvedBrandId = String(record.id ?? brandId);
    const brandLabel = typeof record.label === 'string' ? record.label : null;
    const organizationId = String(record.organizationId ?? '');

    if (!organizationId) {
      throw new HttpException(
        {
          detail: 'Brand is not attached to an organization',
          title: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return { brandId: resolvedBrandId, brandLabel, organizationId };
  }

  /**
   * Detect brand sources from the setup DTO and scrape them, falling back
   * to a minimal brand payload when scraping fails. Never throws: an
   * expected upstream/input failure (unreachable site, blocked, timed out,
   * empty content, upstream provider error) is classified into a stable code
   * and returned as `warning` instead of failing the whole brand setup.
   */
  private async scrapeBrandData(
    dto: BrandSetupDto,
    existingBrand: { label?: string | null },
    caller: string,
  ): Promise<ScrapeBrandDataResult> {
    const detectedSources = this.brandScraperService.detectUrlType(
      dto.brandUrl,
    );
    const sources = {
      linkedinUrl: dto.linkedinUrl || detectedSources.linkedinUrl,
      websiteUrl: detectedSources.websiteUrl,
      xProfileUrl: dto.xProfileUrl || detectedSources.xProfileUrl,
    };

    // If the primary URL was detected as social, keep it as websiteUrl too
    // only when no websiteUrl was resolved
    if (!sources.websiteUrl && !sources.linkedinUrl && !sources.xProfileUrl) {
      sources.websiteUrl = dto.brandUrl;
    }

    const hasMultipleSources =
      [sources.websiteUrl, sources.linkedinUrl, sources.xProfileUrl].filter(
        Boolean,
      ).length > 1;

    this.loggerService.log(`${caller} scraping brand sources`, {
      detectedType: Object.keys(detectedSources).find(
        (k) => detectedSources[k as keyof typeof detectedSources],
      ),
      hasMultipleSources,
      url: dto.brandUrl,
    });

    try {
      let data: IScrapedBrandData;

      if (hasMultipleSources) {
        const merged = await this.brandScraperService.scrapeAllSources(sources);
        data = this.brandDataMapper.mapMergedSources(merged, dto.brandUrl);
      } else if (sources.linkedinUrl) {
        const linkedinData = await this.brandScraperService.scrapeLinkedIn(
          sources.linkedinUrl,
        );
        data = this.brandDataMapper.mapLinkedInData(linkedinData, dto.brandUrl);
      } else if (sources.xProfileUrl) {
        const xData = await this.brandScraperService.scrapeXProfile(
          sources.xProfileUrl,
        );
        data = this.brandDataMapper.mapXProfileData(xData, dto.brandUrl);
      } else {
        data = await this.brandScraperService.scrapeWebsite(dto.brandUrl);
      }

      if (isBrandScrapeContentEmpty(data)) {
        this.loggerService.warn(`${caller} scrape returned no usable content`, {
          code: BRAND_SCRAPE_EMPTY_CONTENT_WARNING.code,
          url: dto.brandUrl,
        });
        return { data, warning: BRAND_SCRAPE_EMPTY_CONTENT_WARNING };
      }

      return { data };
    } catch (scrapeError: unknown) {
      const warning = classifyBrandScrapeError(scrapeError);
      this.loggerService.warn(
        `${caller} scrape failed, continuing with minimal brand setup`,
        {
          code: warning.code,
          error:
            scrapeError instanceof Error
              ? scrapeError.message
              : String(scrapeError),
          url: dto.brandUrl,
        },
      );
      return {
        data: this.brandDataMapper.buildFallbackScrapedData(dto, existingBrand),
        warning,
      };
    }
  }

  /**
   * Analyze brand voice with AI when the scraped data has analyzable content.
   */
  private async analyzeBrandVoice(
    scrapedData: IScrapedBrandData,
    organizationId: string,
    userId: string,
  ): Promise<IBrandVoiceAnalysis | undefined> {
    const hasAnalyzableContent = Boolean(
      scrapedData.description ||
        scrapedData.aboutText ||
        scrapedData.heroText ||
        scrapedData.tagline ||
        (scrapedData.valuePropositions?.length ?? 0) > 0,
    );

    if (!hasAnalyzableContent) {
      return undefined;
    }

    return this.masterPromptGeneratorService.analyzeBrandVoice(scrapedData, {
      organizationId: organizationId.toString(),
      userId: userId.toString(),
    });
  }

  /**
   * Main brand-setup flow: scrape, analyze, and populate an explicit brand.
   *
   * Backs `POST /brands/:id/scrape` (REST audit #1354): the brand to write into
   * is addressed by id in the path. The 9-step scrape + AI orchestration, slug
   * sync, reward unlock, and first-login completion are unchanged.
   */
  async setupBrand(
    brandId: string,
    dto: BrandSetupDto,
    user: User,
  ): Promise<BrandSetupResponse> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`, {
      brandId,
      brandUrl: dto.brandUrl,
    });

    return withOnboardingErrorHandling(
      this.loggerService,
      caller,
      {
        // Unexpected failures here (persistence, unforeseen exceptions) must
        // not leak internal exception text to the onboarding client — only
        // this stable code and generic detail are public. Full diagnostics
        // still reach Sentry/the logger via this same catch (#5080).
        code: BrandScrapeErrorCode.UNKNOWN,
        detail: 'Failed to setup brand',
        hasHttpExceptionPassthrough: true,
        hasPrismaPassthrough: true,
        title: 'Brand Setup Failed',
      },
      async () => {
        // 1. Validate URL
        const validation = this.brandScraperService.validateUrl(dto.brandUrl);
        if (!validation.isValid) {
          throw new HttpException(
            {
              code: BrandScrapeErrorCode.INVALID_URL,
              detail: validation.error,
              title: 'Invalid URL',
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        // 2. Resolve the explicit target brand + its organization scope.
        const {
          brandId: targetBrandId,
          brandLabel,
          organizationId,
        } = await this.resolveBrandScope(brandId);
        const userId = (user.userId ?? user.id)?.toString() ?? '';

        // 3. Scrape brand sources (auto-detected from the URL)
        const { data: scrapedData, warning: scrapeWarning } =
          await this.scrapeBrandData(dto, { label: brandLabel }, caller);

        // 4. Analyze brand voice with AI
        this.loggerService.log(`${caller} analyzing brand voice`);
        const brandVoice = await this.analyzeBrandVoice(
          scrapedData,
          organizationId,
          userId,
        );

        // 5. Build complete extracted data
        const extractedData: IExtractedBrandData = {
          ...scrapedData,
          brandVoice,
        };

        // 6. Update brand with extracted data
        const labelOverride = dto.brandName?.trim() || undefined;
        const resolvedLabel = labelOverride || scrapedData.companyName;

        await this.brandPersistenceService.updateBrandWithScrapedData(
          targetBrandId,
          scrapedData,
          dto,
          labelOverride,
        );
        await this.brandPersistenceService.upsertBrandWebsiteLink(
          targetBrandId,
          dto.brandUrl,
        );
        await this.brandPersistenceService.upsertBrandSocialLinks(
          targetBrandId,
          scrapedData.socialLinks,
        );
        await this.brandPersistenceService.autofillScrapedBrandAssets(
          targetBrandId,
          organizationId,
          userId,
          scrapedData,
        );
        await this.brandPersistenceService.updateBrandGuidance(
          targetBrandId,
          organizationId,
          extractedData,
        );

        // 6b. Sync organization and brand label and slug
        if (resolvedLabel) {
          await this.brandPersistenceService.syncBrandAndOrgSlug(
            resolvedLabel,
            organizationId,
            targetBrandId,
            dto.organizationName?.trim() || resolvedLabel,
          );
        }

        await this.unlockCompanyInfoJourneyReward(organizationId, userId);

        // 7. Mark first login as complete
        await this.completeOnboarding(organizationId);

        this.loggerService.log(`${caller} completed`, {
          brandId: targetBrandId,
        });

        return {
          brandId: targetBrandId,
          extractedData,
          message: 'Brand setup completed successfully',
          success: true,
          ...(scrapeWarning ? { scrapeWarning } : {}),
        };
      },
    );
  }

  /**
   * Rename an explicit brand, optionally cascading the new name to the owning
   * organization's label + slug.
   *
   * Backs the `syncOrganizationName` path of `PATCH /brands/:id` (REST audit
   * #1354). The org-rename cascade is gated to the first-login onboarding window
   * (`OrganizationSettings.isFirstLogin === true`) so a generic client-set flag
   * can never rename an established organization once onboarding has finished.
   */
  async updateBrandNameById(
    brandId: string,
    name: string,
    _user: User,
    options: {
      agentConfig?: UpdateBrandDto['agentConfig'];
      description?: string;
      organizationName?: string;
      text?: string;
    } = {},
  ): Promise<{ success: boolean; message: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`, { brandId, name });

    return withOnboardingErrorHandling(
      this.loggerService,
      caller,
      {
        detail: 'Failed to update brand name',
        hasHttpExceptionPassthrough: true,
        hasPrismaPassthrough: true,
        title: 'Error',
      },
      async () => {
        const { brandId: targetBrandId, organizationId } =
          await this.resolveBrandScope(brandId);

        await this.brandsService.patch(targetBrandId, {
          ...(options.description ? { description: options.description } : {}),
          label: name,
          ...(options.text ? { text: options.text } : {}),
        });

        if (options.agentConfig) {
          await this.brandsService.updateAgentConfig(
            targetBrandId,
            organizationId,
            options.agentConfig,
          );
        }

        // Only cascade the rename to the organization during the first-login
        // onboarding window. Outside it, this is a plain brand label update — an
        // arbitrary brand PATCH must never rename an established organization.
        const settings = await this.organizationSettingsService.findOne({
          organizationId: organizationId,
        });

        if (settings?.isFirstLogin) {
          await this.brandPersistenceService.syncBrandAndOrgSlug(
            name,
            organizationId,
            targetBrandId,
            options.organizationName?.trim() || name,
          );
        }

        this.loggerService.log(`${caller} completed`);

        return {
          message: 'Brand name updated successfully',
          success: true,
        };
      },
    );
  }

  /**
   * Add reference images (face, product, style, logo) to a brand.
   * Backs `POST /brands/:id/reference-images` (REST audit #1354).
   */
  async addReferenceImages(
    brandId: string,
    images: ReferenceImageDto[],
    _user: User,
  ): Promise<{ success: boolean; count: number }> {
    const { organizationId } = await this.resolveBrandScope(brandId);

    return this.brandPersistenceService.addReferenceImages(
      brandId,
      images,
      organizationId,
    );
  }

  private async unlockCompanyInfoJourneyReward(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    await this.onboardingCreditGrantsService.completeMissions(
      organizationId,
      ['complete_company_info'],
      userId,
    );
  }

  /**
   * Mark onboarding as complete (set isFirstLogin to false)
   */
  private async completeOnboarding(organizationId: string): Promise<void> {
    const settings = await this.organizationSettingsService.findOne({
      organizationId: organizationId,
    });

    if (settings) {
      await this.organizationSettingsService.patch(settings.id, {
        isFirstLogin: false,
      });
    }
  }
}
