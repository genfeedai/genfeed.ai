import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UserSetupService } from '@api/collections/users/services/user-setup.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import type {
  BrandSetupDto,
  ConfirmBrandDataDto,
  UpdateBrandNameDto,
} from '@api/endpoints/onboarding/dto/brand-setup.dto';
import { GeneratePreviewDto } from '@api/endpoints/onboarding/dto/generate-preview.dto';
import { ReferenceImageDto } from '@api/endpoints/onboarding/dto/reference-images.dto';
import type {
  BrandSetupResponse,
  InstallReadinessResponse,
  OnboardingWorkspaceContext,
} from '@api/endpoints/onboarding/onboarding.interfaces';
import { ProactiveOnboardingService } from '@api/endpoints/onboarding/proactive-onboarding.service';
import { BrandDataMapper } from '@api/endpoints/onboarding/services/brand-data.mapper';
import { BrandPersistenceService } from '@api/endpoints/onboarding/services/brand-persistence.service';
import { withOnboardingErrorHandling } from '@api/endpoints/onboarding/services/onboarding-error.util';
import { OnboardingPreviewService } from '@api/endpoints/onboarding/services/onboarding-preview.service';
import { OnboardingReadinessService } from '@api/endpoints/onboarding/services/onboarding-readiness.service';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import type { OrganizationCategory } from '@genfeedai/enums';
import type {
  IBrandVoiceAnalysis,
  IExtractedBrandData,
  IScrapedBrandData,
} from '@genfeedai/interfaces';
import {
  type IOnboardingJourneyMissionState,
  ONBOARDING_JOURNEY_MISSIONS,
} from '@genfeedai/types';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * OnboardingService
 *
 * Orchestrates the onboarding flow, delegating to focused collaborators:
 * - OnboardingReadinessService — env/CLI readiness probing and status reads
 * - BrandDataMapper — pure scrape-result → brand-data normalization
 * - BrandPersistenceService — brand/org writes and slug syncing
 * - OnboardingPreviewService — preview image generation pipeline
 *
 * Flow:
 * 1. Accept brand URL from user
 * 2. Scrape website for brand information
 * 3. Analyze with AI to extract brand voice
 * 4. Update Brand structured guidance
 * 5. Mark onboarding as complete
 */
@Injectable()
export class OnboardingService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly brandScraperService: BrandScraperService,
    private readonly masterPromptGeneratorService: MasterPromptGeneratorService,
    private readonly brandsService: BrandsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly organizationsService: OrganizationsService,
    private readonly usersService: UsersService,
    private readonly proactiveOnboardingService: ProactiveOnboardingService,
    private readonly requestContextCacheService: RequestContextCacheService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
    private readonly betterAuthIdentityCacheService: BetterAuthIdentityCacheService,
    private readonly userSetupService: UserSetupService,
    private readonly brandDataMapper: BrandDataMapper,
    private readonly brandPersistenceService: BrandPersistenceService,
    private readonly onboardingPreviewService: OnboardingPreviewService,
    private readonly onboardingReadinessService: OnboardingReadinessService,
  ) {}

  private getEntityId(record: unknown): string {
    if (!record || typeof record !== 'object') {
      return '';
    }

    const entity = record as Record<string, unknown>;
    const id = entity.id;

    return typeof id === 'string' ? id : '';
  }

  private async ensureOnboardingWorkspace(
    user: User,
    category?: OrganizationCategory,
  ): Promise<OnboardingWorkspaceContext> {
    const publicMetadata = getPublicMetadata(user);
    let userId = publicMetadata.user?.toString() ?? '';

    let dbUser = userId
      ? await this.usersService.findOne({ _id: userId, isDeleted: false }, [])
      : null;

    if (!dbUser && user.id) {
      dbUser = await this.usersService.findOne(
        { authProviderId: user.id, isDeleted: false },
        [],
      );
    }

    userId = this.getEntityId(dbUser) || userId;
    if (!userId) {
      throw new HttpException(
        {
          detail:
            'Missing local user account for legacy auth provider authorization',
          title: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    let organizationId = publicMetadata.organization?.toString() ?? '';
    let brandId: string | null = publicMetadata.brand?.toString() ?? null;

    // Resolve the active org DB-first before provisioning (epic #735, Phase C):
    // post-legacy auth provider, publicMetadata.organization is no longer written, so fall back
    // to User.lastUsedOrganizationId and then the user's owned org. Without this,
    // every onboarding step would re-run initializeUserResources for a user who
    // already has a workspace.
    if (!organizationId) {
      const lastUsedOrganizationId =
        (
          dbUser as { lastUsedOrganizationId?: string | null } | null
        )?.lastUsedOrganizationId?.toString() ?? '';

      if (lastUsedOrganizationId) {
        organizationId = lastUsedOrganizationId;
      } else {
        const ownedOrg = await this.organizationsService.findOne({
          isDeleted: false,
          user: userId,
        });
        organizationId = this.getEntityId(ownedOrg);
      }
    }

    if (!organizationId) {
      const setupResult = await this.userSetupService.initializeUserResources(
        userId,
        category,
      );

      organizationId = this.getEntityId(setupResult.organization);
      brandId = this.getEntityId(setupResult.brand) || null;
    }

    try {
      // Persist the active org to the DB so both identity resolvers route to it
      // (epic #735, Phase C — no legacy auth provider write-back). Brand resolves from the
      // member's lastUsedBrandId / org default.
      await this.usersService.patch(userId, {
        lastUsedOrganizationId: organizationId,
      });
    } catch (error: unknown) {
      this.loggerService.warn(
        'Failed to set active organization during onboarding',
        {
          error: error instanceof Error ? error.message : error,
          organizationId,
          userId,
        },
      );
    }

    return { brandId, organizationId, userId };
  }

  /**
   * Detect brand sources from the setup DTO and scrape them, falling back
   * to a minimal brand payload when scraping fails.
   */
  private async scrapeBrandData(
    dto: BrandSetupDto,
    existingBrand: { label?: string | null },
    caller: string,
  ): Promise<IScrapedBrandData> {
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
      if (hasMultipleSources) {
        const merged = await this.brandScraperService.scrapeAllSources(sources);
        return this.brandDataMapper.mapMergedSources(merged, dto.brandUrl);
      }

      if (sources.linkedinUrl) {
        const linkedinData = await this.brandScraperService.scrapeLinkedIn(
          sources.linkedinUrl,
        );
        return this.brandDataMapper.mapLinkedInData(linkedinData, dto.brandUrl);
      }

      if (sources.xProfileUrl) {
        const xData = await this.brandScraperService.scrapeXProfile(
          sources.xProfileUrl,
        );
        return this.brandDataMapper.mapXProfileData(xData, dto.brandUrl);
      }

      return await this.brandScraperService.scrapeWebsite(dto.brandUrl);
    } catch (scrapeError: unknown) {
      this.loggerService.warn(
        `${caller} scrape failed, continuing with minimal brand setup`,
        {
          error:
            scrapeError instanceof Error
              ? scrapeError.message
              : String(scrapeError),
          url: dto.brandUrl,
        },
      );
      return this.brandDataMapper.buildFallbackScrapedData(dto, existingBrand);
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
   * Main onboarding flow: scrape, analyze, and setup brand
   */
  async setupBrand(
    dto: BrandSetupDto,
    user: User,
  ): Promise<BrandSetupResponse> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`, { brandUrl: dto.brandUrl });

    return withOnboardingErrorHandling(
      this.loggerService,
      caller,
      {
        detail: 'Failed to setup brand',
        hasHttpExceptionPassthrough: true,
        hasPrismaPassthrough: true,
        isErrorMessageUsed: true,
        title: 'Brand Setup Failed',
      },
      async () => {
        // 1. Validate URL
        const validation = this.brandScraperService.validateUrl(dto.brandUrl);
        if (!validation.isValid) {
          throw new HttpException(
            { detail: validation.error, title: 'Invalid URL' },
            HttpStatus.BAD_REQUEST,
          );
        }

        const workspace = await this.ensureOnboardingWorkspace(user);
        const organizationId = workspace.organizationId;
        const userId = workspace.userId;

        // 2. Find existing brand for user (created during signup)
        const existingBrand =
          await this.brandPersistenceService.resolveOnboardingBrand(
            organizationId,
            userId,
            workspace.brandId,
          );

        if (!existingBrand) {
          throw new HttpException(
            { detail: 'No brand found for user', title: 'Brand Not Found' },
            HttpStatus.NOT_FOUND,
          );
        }

        // 3. Scrape brand sources (auto-detected from the URL)
        const scrapedData = await this.scrapeBrandData(
          dto,
          existingBrand,
          caller,
        );

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
        const targetBrand =
          await this.brandPersistenceService.resolveWritableOnboardingBrand(
            existingBrand,
            organizationId,
            userId,
            resolvedLabel,
          );

        await this.brandPersistenceService.updateBrandWithScrapedData(
          targetBrand.id,
          scrapedData,
          dto,
          labelOverride,
        );
        await this.brandPersistenceService.upsertBrandWebsiteLink(
          targetBrand.id,
          dto.brandUrl,
        );
        await this.brandPersistenceService.updateBrandGuidance(
          targetBrand.id,
          extractedData,
        );

        // 6b. Sync organization and brand label and slug
        if (resolvedLabel) {
          await this.brandPersistenceService.syncBrandAndOrgSlug(
            resolvedLabel,
            organizationId.toString(),
            targetBrand.id,
          );
        }

        await this.unlockCompanyInfoJourneyReward(organizationId.toString());

        // 7. Mark first login as complete
        await this.completeOnboarding(organizationId);

        this.loggerService.log(`${caller} completed`, {
          brandId: targetBrand.id.toString(),
        });

        return {
          brandId: targetBrand.id.toString(),
          extractedData,
          message: 'Brand setup completed successfully',
          success: true,
        };
      },
    );
  }

  private async unlockCompanyInfoJourneyReward(
    organizationId: string,
  ): Promise<void> {
    const settings = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: organizationId,
    });

    if (!settings?.id) {
      return;
    }

    const normalizedMissions =
      this.organizationSettingsService.normalizeJourneyState(
        settings.onboardingJourneyMissions as unknown as
          | IOnboardingJourneyMissionState[]
          | undefined,
      );
    const mission = normalizedMissions.find(
      (item) => item.id === 'complete_company_info',
    );

    if (!mission || mission.rewardClaimed) {
      return;
    }

    const updatedMissions = normalizedMissions.map((item) =>
      item.id === 'complete_company_info'
        ? {
            ...item,
            completedAt: item.completedAt ?? new Date(),
            isCompleted: true,
            rewardClaimed: true,
          }
        : item,
    );

    await this.organizationSettingsService.patch(String(settings.id), {
      onboardingJourneyMissions: updatedMissions,
    });

    await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
      organizationId,
      ONBOARDING_JOURNEY_MISSIONS.find(
        (item) => item.id === 'complete_company_info',
      )?.rewardCredits ?? 25,
      'onboarding-journey',
      'Onboarding journey reward: company information completed',
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    );
  }

  /**
   * Confirm and optionally override extracted brand data
   */
  async confirmBrandData(
    brandId: string,
    dto: ConfirmBrandDataDto,
    user: User,
  ): Promise<{ success: boolean; message: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`, { brandId });

    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;

    return withOnboardingErrorHandling(
      this.loggerService,
      caller,
      {
        detail: 'Failed to confirm brand data',
        hasHttpExceptionPassthrough: true,
        hasPrismaPassthrough: true,
        title: 'Error',
      },
      async () => {
        // Verify brand belongs to user's organization
        const brand = await this.brandsService.findOne(
          {
            _id: brandId,
            isDeleted: false,
            organization: organizationId,
          },
          'none',
        );

        if (!brand) {
          throw new HttpException(
            { detail: 'Brand not found', title: 'Not Found' },
            HttpStatus.NOT_FOUND,
          );
        }

        // Update brand with overrides
        const updateData: Record<string, unknown> = {};

        if (dto.label) {
          updateData.label = dto.label;
        }
        if (dto.description) {
          updateData.description = dto.description;
        }
        if (dto.primaryColor) {
          updateData.primaryColor = dto.primaryColor;
        }
        if (dto.secondaryColor) {
          updateData.secondaryColor = dto.secondaryColor;
        }
        if (dto.fontFamily) {
          updateData.fontFamily = dto.fontFamily;
        }

        if (Object.keys(updateData).length > 0) {
          await this.brandsService.patch(brand.id, updateData);
        }

        // Sync organization and brand label and slug when brand label is updated
        if (dto.label) {
          await this.brandPersistenceService.syncBrandAndOrgSlug(
            dto.label,
            organizationId.toString(),
            brand.id,
          );
        }

        // Update canonical brand guidance if voice overrides provided
        if (dto.tone || dto.voice || dto.audience) {
          await this.brandPersistenceService.updateBrandGuidanceOverrides(
            brand.id,
            dto,
          );
        }

        this.loggerService.log(`${caller} completed`);

        return {
          message: 'Brand data confirmed successfully',
          success: true,
        };
      },
    );
  }

  /**
   * Skip onboarding for users who want to set up later
   */
  async skipOnboarding(
    user: User,
  ): Promise<{ success: boolean; message: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`);

    return withOnboardingErrorHandling(
      this.loggerService,
      caller,
      { detail: 'Failed to skip onboarding', title: 'Error' },
      async () => {
        const { organizationId } = await this.ensureOnboardingWorkspace(user);
        // Mark onboarding as skipped
        await this.completeOnboarding(organizationId);

        this.loggerService.log(`${caller} completed`);

        return {
          message: 'Onboarding skipped. You can set up your brand later.',
          success: true,
        };
      },
    );
  }

  /**
   * Get onboarding status for user
   */
  async getOnboardingStatus(
    user: User,
  ): Promise<{ isFirstLogin: boolean; hasCompletedOnboarding: boolean }> {
    const { organizationId } = await this.ensureOnboardingWorkspace(user);

    return this.onboardingReadinessService.getOnboardingStatus(organizationId);
  }

  async getInstallReadiness(user: User): Promise<InstallReadinessResponse> {
    const workspace = await this.ensureOnboardingWorkspace(user);

    return this.onboardingReadinessService.getInstallReadiness(user, workspace);
  }

  /**
   * Set the organization's account type.
   */
  async setAccountType(
    user: User,
    category: OrganizationCategory,
  ): Promise<{ success: boolean; message: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`, { category });

    return withOnboardingErrorHandling(
      this.loggerService,
      caller,
      {
        detail: 'Failed to set account type',
        hasHttpExceptionPassthrough: true,
        title: 'Error',
      },
      async () => {
        const { organizationId } = await this.ensureOnboardingWorkspace(
          user,
          category,
        );
        await this.organizationsService.patch(organizationId.toString(), {
          accountType: category,
          category,
        });

        this.loggerService.log(`${caller} completed`, { category });

        return {
          message: `Account type set to ${category}`,
          success: true,
        };
      },
    );
  }

  /**
   * Mark the onboarding funnel as completed.
   */
  async completeFunnel(
    user: User,
  ): Promise<{ success: boolean; message: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`);

    return withOnboardingErrorHandling(
      this.loggerService,
      caller,
      { detail: 'Failed to complete onboarding funnel', title: 'Error' },
      async () => {
        const workspace = await this.ensureOnboardingWorkspace(user);
        const publicMetadata = getPublicMetadata(user);
        const proactiveLeadId = publicMetadata.proactiveLeadId?.toString();
        const organizationId = workspace.organizationId;

        if (proactiveLeadId && organizationId) {
          await this.proactiveOnboardingService.markPaymentMade(
            proactiveLeadId,
            organizationId,
          );
        }

        // Update the DB so OnboardingGuard is satisfied; onboarding completion is
        // read from the User row, not provider metadata.
        const dbUser = await this.usersService.findOne({
          authProviderId: user.id,
        });
        if (dbUser && !dbUser.isOnboardingCompleted) {
          await this.usersService.patch(dbUser.id, {
            isOnboardingCompleted: true,
            onboardingCompletedAt: new Date(),
            onboardingStepsCompleted: ['brand', 'providers'],
          });
        }

        const dbUserId = dbUser?.id?.toString();
        if (dbUserId) {
          await Promise.all([
            this.requestContextCacheService.invalidateForUser(dbUserId),
            this.accessBootstrapCacheService.invalidateForUser(dbUserId),
            this.betterAuthIdentityCacheService.invalidateForUser(dbUserId),
          ]);
        }

        this.loggerService.log(`${caller} completed`);

        return {
          message: 'Onboarding funnel completed',
          success: true,
        };
      },
    );
  }

  async getProactiveWorkspace(user: User): Promise<{
    success: boolean;
    proactiveStatus: string;
    prepPercent: number;
    prepStage: string;
    brand?: unknown;
    organization?: unknown;
    outputs: unknown[];
    summary: string;
  }> {
    const publicMetadata = getPublicMetadata(user);
    const leadId = publicMetadata.proactiveLeadId?.toString();
    const organizationId = publicMetadata.organization?.toString();

    if (!leadId || !organizationId) {
      throw new HttpException(
        {
          detail: 'Missing proactive onboarding context',
          title: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.proactiveOnboardingService.getWorkspaceSummary(
      leadId,
      organizationId,
    );
  }

  async claimProactiveWorkspace(user: User): Promise<{
    success: boolean;
    proactiveStatus: string;
    prepPercent: number;
    prepStage: string;
    brand?: unknown;
    organization?: unknown;
    outputs: unknown[];
    summary: string;
    claimedAt?: Date;
  }> {
    const publicMetadata = getPublicMetadata(user);
    const leadId = publicMetadata.proactiveLeadId?.toString();
    const organizationId = publicMetadata.organization?.toString();
    const userId = publicMetadata.user?.toString();

    if (!leadId || !organizationId || !userId) {
      throw new HttpException(
        {
          detail: 'Missing proactive onboarding context',
          title: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.proactiveOnboardingService.claimWorkspace(
      leadId,
      organizationId,
      userId,
    );
  }

  /**
   * Generate an AI preview image during onboarding
   */
  async generateOnboardingPreview(
    dto: GeneratePreviewDto,
    user: User,
  ): Promise<{ imageUrl: string; prompt: string }> {
    return this.onboardingPreviewService.generateOnboardingPreview(dto, user);
  }

  /**
   * Add reference images to a brand
   */
  async addReferenceImages(
    brandId: string,
    images: ReferenceImageDto[],
    user: User,
  ): Promise<{ success: boolean; count: number }> {
    const publicMetadata = getPublicMetadata(user);

    return this.brandPersistenceService.addReferenceImages(
      brandId,
      images,
      publicMetadata.organization,
    );
  }

  /**
   * Update brand and organization name without scanning
   */
  async updateBrandName(
    dto: UpdateBrandNameDto,
    user: User,
  ): Promise<{ success: boolean; message: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`, {
      brandName: dto.brandName,
    });

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
        const workspace = await this.ensureOnboardingWorkspace(user);
        const organizationId = workspace.organizationId;
        const userId = workspace.userId;

        const brand = await this.brandsService.findOne(
          {
            isDeleted: false,
            organization: organizationId,
            user: userId,
          },
          'none',
        );

        if (!brand) {
          throw new HttpException(
            { detail: 'No brand found for user', title: 'Brand Not Found' },
            HttpStatus.NOT_FOUND,
          );
        }

        await this.brandsService.patch(brand.id, {
          label: dto.brandName,
        });

        // Keep brand.slug in sync with the label (matching the scan-based and
        // brand-update paths); the brand id excludes the brand's own current
        // slug from uniqueness collision.
        await this.brandPersistenceService.syncBrandAndOrgSlug(
          dto.brandName,
          organizationId.toString(),
          String(brand.id),
        );

        this.loggerService.log(`${caller} completed`);

        return {
          message: 'Brand name updated successfully',
          success: true,
        };
      },
    );
  }

  /**
   * Check if a prefix is available
   */
  async checkPrefixAvailable(prefix: string): Promise<boolean> {
    return this.organizationsService.isPrefixAvailable(prefix);
  }

  /**
   * Mark onboarding as complete (set isFirstLogin to false)
   */
  private async completeOnboarding(organizationId: string): Promise<void> {
    const settings = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: organizationId,
    });

    if (settings) {
      await this.organizationSettingsService.patch(settings.id, {
        isFirstLogin: false,
      });
    }
  }
}
