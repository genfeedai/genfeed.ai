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
import type { BrandSetupDto } from '@api/endpoints/onboarding/dto/brand-setup.dto';
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
   * Main onboarding flow: scrape, analyze, and set up an explicit brand.
   *
   * Backs `POST /brands/:id/scrape` (REST audit #1354): the brand to write into
   * is now addressed by id in the path rather than resolved from user context.
   * The 9-step scrape + AI orchestration, slug sync, reward unlock, and
   * first-login completion are unchanged.
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

        // Resolve/provision the workspace (safety net for the rare case where
        // signup-time provisioning failed) and use it as the org/user scope.
        const workspace = await this.ensureOnboardingWorkspace(user);
        const organizationId = workspace.organizationId;
        const userId = workspace.userId;

        // 2. Resolve the explicit target brand, scoped to the workspace org.
        const targetBrand = await this.brandsService.findOne(
          {
            _id: brandId,
            isDeleted: false,
            organization: organizationId,
          },
          'none',
        );

        if (!targetBrand) {
          throw new HttpException(
            { detail: 'Brand not found', title: 'Brand Not Found' },
            HttpStatus.NOT_FOUND,
          );
        }

        // 3. Scrape brand sources (auto-detected from the URL)
        const scrapedData = await this.scrapeBrandData(
          dto,
          targetBrand,
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
   * Mark the onboarding funnel as completed.
   *
   * Idempotent completion cascade backing `PATCH /users/me { isOnboardingCompleted: true }`
   * (REST audit #1354): resolves/repairs the workspace, best-effort marks the proactive
   * lead paid, patches the User row only when not already completed, and invalidates the
   * access caches so `OnboardingGuard` sees the new state on the next request.
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

        // Best-effort: a lead-status mismatch must not block onboarding completion
        // (the user has already paid via Stripe before this fires).
        if (proactiveLeadId && organizationId) {
          try {
            await this.proactiveOnboardingService.markPaymentMade(
              proactiveLeadId,
              organizationId,
            );
          } catch (error: unknown) {
            this.loggerService.warn(`${caller} markPaymentMade skipped`, {
              error: error instanceof Error ? error.message : error,
              organizationId,
              proactiveLeadId,
            });
          }
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
   * Rename an explicit brand during onboarding, optionally cascading the new
   * name to the owning organization's label + slug.
   *
   * Backs the `syncOrganizationName` path of `PATCH /brands/:id` (REST audit #1354).
   * The org-rename cascade is gated to the first-login onboarding window
   * (`OrganizationSettings.isFirstLogin === true`) so a generic client-set flag
   * can never rename an established organization once onboarding has finished.
   */
  async updateBrandNameById(
    brandId: string,
    name: string,
    user: User,
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
        const workspace = await this.ensureOnboardingWorkspace(user);
        const organizationId = workspace.organizationId;

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
            { detail: 'Brand not found', title: 'Brand Not Found' },
            HttpStatus.NOT_FOUND,
          );
        }

        await this.brandsService.patch(brand.id, {
          label: name,
        });

        // Only cascade the rename to the organization during the first-login
        // onboarding window. Outside it, this is a plain brand label update — an
        // arbitrary brand PATCH must never rename an established organization.
        const settings = await this.organizationSettingsService.findOne({
          isDeleted: false,
          organization: organizationId.toString(),
        });

        if (settings?.isFirstLogin) {
          await this.brandPersistenceService.syncBrandAndOrgSlug(
            name,
            organizationId.toString(),
            String(brand.id),
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
   * Check if a prefix is available
   */
  async checkPrefixAvailable(prefix: string): Promise<boolean> {
    return this.organizationsService.isPrefixAvailable(prefix);
  }

  /**
   * Set the organization's unique prefix (immutable once set)
   */
  async setPrefix(
    user: User,
    prefix: string,
  ): Promise<{ success: boolean; message: string; prefix: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`, { prefix });

    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;

    return withOnboardingErrorHandling(
      this.loggerService,
      caller,
      {
        detail: 'Failed to set organization prefix',
        hasHttpExceptionPassthrough: true,
        title: 'Error',
      },
      async () => {
        // Check if org already has a prefix
        const org = await this.organizationsService.findOne({
          _id: organizationId,
          isDeleted: false,
        });

        if (!org) {
          throw new HttpException(
            { detail: 'Organization not found', title: 'Not Found' },
            HttpStatus.NOT_FOUND,
          );
        }

        if (org.prefix) {
          throw new HttpException(
            {
              detail: `Organization already has prefix "${org.prefix}". Prefix is immutable once set.`,
              title: 'Conflict',
            },
            HttpStatus.CONFLICT,
          );
        }

        // Check uniqueness
        const isAvailable =
          await this.organizationsService.isPrefixAvailable(prefix);
        if (!isAvailable) {
          throw new HttpException(
            {
              detail: `Prefix "${prefix}" is already taken`,
              title: 'Conflict',
            },
            HttpStatus.CONFLICT,
          );
        }

        // Set the prefix
        await this.organizationsService.patch(organizationId.toString(), {
          // @ts-expect-error prefix is not in UpdateOrganizationDto (immutable), but we set it directly here during onboarding
          prefix: prefix.toUpperCase(),
        });

        this.loggerService.log(`${caller} completed`, { prefix });

        return {
          message: `Organization prefix set to "${prefix.toUpperCase()}"`,
          prefix: prefix.toUpperCase(),
          success: true,
        };
      },
    );
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
