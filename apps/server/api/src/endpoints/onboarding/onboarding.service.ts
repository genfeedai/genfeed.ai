import { spawnSync } from 'node:child_process';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { ProactiveOnboardingService } from '@api/endpoints/admin/crm/proactive-onboarding.service';
import type {
  BrandSetupDto,
  ConfirmBrandDataDto,
  UpdateBrandNameDto,
} from '@api/endpoints/onboarding/dto/brand-setup.dto';
import { GeneratePreviewDto } from '@api/endpoints/onboarding/dto/generate-preview.dto';
import { ReferenceImageDto } from '@api/endpoints/onboarding/dto/reference-images.dto';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { ComfyUIService } from '@api/services/integrations/comfyui/comfyui.service';
import { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import type { User } from '@clerk/backend';
import { isEEEnabled } from '@genfeedai/config';
import { MODEL_KEYS } from '@genfeedai/constants';
import { FileInputType, type OrganizationCategory } from '@genfeedai/enums';
import type {
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
import { Types } from 'mongoose';

/** Credits cost for generating an onboarding preview image */
const ONBOARDING_PREVIEW_CREDIT_COST = 5;

/**
 * Response from brand setup operation
 */
export interface BrandSetupResponse {
  success: boolean;
  brandId: string;
  extractedData: IExtractedBrandData;
  message?: string;
}

export interface InstallReadinessResponse {
  authMode: 'clerk' | 'none';
  billingMode: 'cloud_billing' | 'oss_local';
  localTools: {
    anyDetected: boolean;
    claude: boolean;
    codex: boolean;
    detected: string[];
  };
  providers: {
    anyConfigured: boolean;
    configured: string[];
    fal: boolean;
    imageGenerationReady: boolean;
    openai: boolean;
    replicate: boolean;
    textGenerationReady: boolean;
  };
  ui: {
    showBilling: boolean;
    showCloudUpgradeCta: boolean;
    showCredits: boolean;
    showPricing: boolean;
  };
  workspace: {
    brandId: string | null;
    hasBrand: boolean;
    hasOrganization: boolean;
    organizationId: string | null;
  };
}

/**
 * OnboardingService
 *
 * Handles the onboarding flow:
 * 1. Accept brand URL from user
 * 2. Scrape website for brand information
 * 3. Analyze with AI to extract brand voice
 * 4. Update Brand structured guidance
 * 6. Mark onboarding as complete
 */
@Injectable()
export class OnboardingService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly brandScraperService: BrandScraperService,
    private readonly masterPromptGeneratorService: MasterPromptGeneratorService,
    private readonly brandsService: BrandsService,
    private readonly comfyUIService: ComfyUIService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly filesClientService: FilesClientService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly organizationsService: OrganizationsService,
    private readonly clerkService: ClerkService,
    private readonly usersService: UsersService,
    private readonly proactiveOnboardingService: ProactiveOnboardingService,
    private readonly requestContextCacheService: RequestContextCacheService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
  ) {}

  private isConfigured(value: unknown): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private getProviderReadiness() {
    const replicate = this.isConfigured(process.env.REPLICATE_KEY);
    const fal = this.isConfigured(process.env.FAL_API_KEY);
    const openai = this.isConfigured(process.env.OPENAI_API_KEY);
    const configured = [
      replicate ? 'replicate' : null,
      fal ? 'fal' : null,
      openai ? 'openai' : null,
    ].filter((value): value is string => value !== null);

    return {
      anyConfigured: configured.length > 0,
      configured,
      fal,
      imageGenerationReady: fal || replicate,
      openai,
      replicate,
      textGenerationReady: openai,
    };
  }

  private isCommandAvailable(command: string): boolean {
    const result = spawnSync(command, ['--version'], {
      encoding: 'utf8',
      shell: false,
      stdio: 'ignore',
    });

    if (result.error) {
      return false;
    }

    return result.status === 0;
  }

  private getLocalToolReadiness() {
    const claude = this.isCommandAvailable('claude');
    const codex = this.isCommandAvailable('codex');
    const detected = [claude ? 'claude' : null, codex ? 'codex' : null].filter(
      (value): value is string => value !== null,
    );

    return {
      anyDetected: detected.length > 0,
      claude,
      codex,
      detected,
    };
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

    const publicMetadata = getPublicMetadata(user);
    const organizationId = new Types.ObjectId(publicMetadata.organization);
    const userId = new Types.ObjectId(publicMetadata.user);

    try {
      // 1. Validate URL
      const validation = this.brandScraperService.validateUrl(dto.brandUrl);
      if (!validation.isValid) {
        throw new HttpException(
          { detail: validation.error, title: 'Invalid URL' },
          HttpStatus.BAD_REQUEST,
        );
      }

      // 2. Find existing brand for user (created during signup)
      const existingBrand = await this.brandsService.findOne(
        {
          isDeleted: false,
          organization: organizationId,
          user: userId,
        },
        'none',
      );

      if (!existingBrand) {
        throw new HttpException(
          { detail: 'No brand found for user', title: 'Brand Not Found' },
          HttpStatus.NOT_FOUND,
        );
      }

      // 3. Auto-detect URL type and build sources
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

      let scrapedData: IScrapedBrandData;
      if (hasMultipleSources) {
        const merged = await this.brandScraperService.scrapeAllSources(sources);
        scrapedData = {
          aboutText: merged.aboutText,
          companyName: merged.companyName,
          description: merged.description,
          fontFamily: merged.fontFamily,
          heroText: merged.heroText,
          logoUrl: merged.logoUrl,
          metaDescription: merged.description,
          ogImage: undefined,
          primaryColor: merged.primaryColor,
          scrapedAt: merged.scrapedAt,
          secondaryColor: merged.secondaryColor,
          socialLinks: merged.socialLinks,
          sourceUrl: dto.brandUrl,
          tagline: merged.tagline,
          valuePropositions: merged.valuePropositions,
        };
      } else if (sources.linkedinUrl) {
        const linkedinData = await this.brandScraperService.scrapeLinkedIn(
          sources.linkedinUrl,
        );
        scrapedData = {
          aboutText: undefined,
          companyName: linkedinData.companyName,
          description: linkedinData.description,
          fontFamily: undefined,
          heroText: undefined,
          logoUrl: linkedinData.logoUrl,
          metaDescription: linkedinData.description,
          ogImage: linkedinData.coverImageUrl,
          primaryColor: undefined,
          scrapedAt: linkedinData.scrapedAt,
          secondaryColor: undefined,
          socialLinks: {},
          sourceUrl: dto.brandUrl,
          tagline: undefined,
          valuePropositions: [],
        };
      } else if (sources.xProfileUrl) {
        const xData = await this.brandScraperService.scrapeXProfile(
          sources.xProfileUrl,
        );
        scrapedData = {
          aboutText: undefined,
          companyName: xData.displayName,
          description: xData.bio,
          fontFamily: undefined,
          heroText: undefined,
          logoUrl: xData.profileImageUrl,
          metaDescription: xData.bio,
          ogImage: xData.profileImageUrl,
          primaryColor: undefined,
          scrapedAt: xData.scrapedAt,
          secondaryColor: undefined,
          socialLinks: {},
          sourceUrl: dto.brandUrl,
          tagline: undefined,
          valuePropositions: [],
        };
      } else {
        scrapedData = await this.brandScraperService.scrapeWebsite(
          dto.brandUrl,
        );
      }

      // 4. Analyze brand voice with AI
      this.loggerService.log(`${caller} analyzing brand voice`);
      const brandVoice =
        await this.masterPromptGeneratorService.analyzeBrandVoice(scrapedData, {
          organizationId: organizationId.toString(),
          userId: userId.toString(),
        });

      // 5. Build complete extracted data
      const extractedData: IExtractedBrandData = {
        ...scrapedData,
        brandVoice,
      };

      // 6. Update brand with extracted data
      const labelOverride = dto.brandName?.trim() || undefined;
      await this.updateBrandWithScrapedData(
        existingBrand._id,
        scrapedData,
        dto,
        labelOverride,
      );
      await this.updateBrandGuidance(existingBrand._id, extractedData);

      // 6b. Sync organization label and slug
      const resolvedLabel = labelOverride || scrapedData.companyName;
      if (resolvedLabel) {
        const slug =
          await this.organizationsService.generateUniqueSlug(resolvedLabel);
        await this.organizationsService.patch(organizationId.toString(), {
          label: resolvedLabel,
          slug,
        });
      }

      await this.unlockCompanyInfoJourneyReward(organizationId.toString());

      // 7. Mark first login as complete
      await this.completeOnboarding(organizationId);

      this.loggerService.log(`${caller} completed`, {
        brandId: existingBrand._id.toString(),
      });

      return {
        brandId: existingBrand._id.toString(),
        extractedData,
        message: 'Brand setup completed successfully',
        success: true,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          detail: (error as Error)?.message || 'Failed to setup brand',
          title: 'Brand Setup Failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async unlockCompanyInfoJourneyReward(
    organizationId: string,
  ): Promise<void> {
    const settings = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    if (!settings?._id) {
      return;
    }

    const normalizedMissions =
      this.organizationSettingsService.normalizeJourneyState(
        settings.onboardingJourneyMissions as
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

    await this.organizationSettingsService.patch(String(settings._id), {
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
    const organizationId = new Types.ObjectId(publicMetadata.organization);

    try {
      // Verify brand belongs to user's organization
      const brand = await this.brandsService.findOne(
        {
          _id: new Types.ObjectId(brandId),
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
        await this.brandsService.patch(brand._id, updateData);
      }

      // Sync organization label and slug when brand label is updated
      if (dto.label) {
        const slug = await this.organizationsService.generateUniqueSlug(
          dto.label,
        );
        await this.organizationsService.patch(organizationId.toString(), {
          label: dto.label,
          slug,
        });
      }

      // Update canonical brand guidance if voice overrides provided
      if (dto.tone || dto.voice || dto.audience) {
        await this.updateBrandGuidanceOverrides(brand._id, dto);
      }

      this.loggerService.log(`${caller} completed`);

      return {
        message: 'Brand data confirmed successfully',
        success: true,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        { detail: 'Failed to confirm brand data', title: 'Error' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Skip onboarding for users who want to set up later
   */
  async skipOnboarding(
    user: User,
  ): Promise<{ success: boolean; message: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`);

    const publicMetadata = getPublicMetadata(user);
    const organizationId = new Types.ObjectId(publicMetadata.organization);

    try {
      // Mark onboarding as skipped
      await this.completeOnboarding(organizationId);

      this.loggerService.log(`${caller} completed`);

      return {
        message: 'Onboarding skipped. You can set up your brand later.',
        success: true,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);

      throw new HttpException(
        { detail: 'Failed to skip onboarding', title: 'Error' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get onboarding status for user
   */
  async getOnboardingStatus(
    user: User,
  ): Promise<{ isFirstLogin: boolean; hasCompletedOnboarding: boolean }> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = new Types.ObjectId(publicMetadata.organization);

    const settings = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: organizationId,
    });

    return {
      hasCompletedOnboarding: settings?.isFirstLogin === false,
      isFirstLogin: settings?.isFirstLogin ?? true,
    };
  }

  async getInstallReadiness(user: User): Promise<InstallReadinessResponse> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization?.toString() ?? null;
    const brandId = publicMetadata.brand?.toString() ?? null;
    const providers = this.getProviderReadiness();
    const showBillingUi = isEEEnabled();

    let hasOrganization = false;
    let hasBrand = false;

    if (organizationId && Types.ObjectId.isValid(organizationId)) {
      const organization = await this.organizationsService.findOne({
        _id: new Types.ObjectId(organizationId),
        isDeleted: false,
      });

      hasOrganization = !!organization;

      if (organization) {
        const brand = await this.brandsService.findOne({
          isDeleted: false,
          organization: organization._id,
        });

        hasBrand = !!brand;
      }
    }

    return {
      authMode: user.id ? 'clerk' : 'none',
      billingMode: showBillingUi ? 'cloud_billing' : 'oss_local',
      localTools: this.getLocalToolReadiness(),
      providers,
      ui: {
        showBilling: showBillingUi,
        showCloudUpgradeCta: !showBillingUi,
        showCredits: showBillingUi,
        showPricing: showBillingUi,
      },
      workspace: {
        brandId,
        hasBrand,
        hasOrganization,
        organizationId,
      },
    };
  }

  /**
   * Set the organization's account type and update Clerk metadata
   */
  async setAccountType(
    user: User,
    category: OrganizationCategory,
  ): Promise<{ success: boolean; message: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`, { category });

    const publicMetadata = getPublicMetadata(user);
    const organizationId = new Types.ObjectId(publicMetadata.organization);

    try {
      await this.organizationsService.patch(organizationId.toString(), {
        accountType: category,
        category,
      });

      await this.clerkService.updateUserPublicMetadata(user.id, {
        // @ts-expect-error accountType is valid
        accountType: category,
        category,
      });

      this.loggerService.log(`${caller} completed`, { category });

      return {
        message: `Account type set to ${category}`,
        success: true,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        { detail: 'Failed to set account type', title: 'Error' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Mark the onboarding funnel as completed in Clerk metadata
   */
  async completeFunnel(
    user: User,
  ): Promise<{ success: boolean; message: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`);

    try {
      const publicMetadata = getPublicMetadata(user);
      const proactiveLeadId = publicMetadata.proactiveLeadId?.toString();
      const organizationId = publicMetadata.organization?.toString();

      if (proactiveLeadId && organizationId) {
        await this.proactiveOnboardingService.markPaymentMade(
          proactiveLeadId,
          organizationId,
        );
      }

      await this.clerkService.updateUserPublicMetadata(user.id, {
        isOnboardingCompleted: true,
      });

      // Also update MongoDB so OnboardingGuard is satisfied
      const dbUser = await this.usersService.findOne({ clerkId: user.id });
      if (dbUser && !dbUser.isOnboardingCompleted) {
        await this.usersService.patch(dbUser._id, {
          isOnboardingCompleted: true,
          onboardingCompletedAt: new Date(),
          onboardingStepsCompleted: ['brand', 'providers'],
        });
      }

      await Promise.all([
        this.requestContextCacheService.invalidateForUser(user.id),
        this.accessBootstrapCacheService.invalidateForUser(user.id),
      ]);

      this.loggerService.log(`${caller} completed`);

      return {
        message: 'Onboarding funnel completed',
        success: true,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);

      throw new HttpException(
        { detail: 'Failed to complete onboarding funnel', title: 'Error' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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
   * Uses ComfyUI to generate an image based on brand data and content type
   */
  async generateOnboardingPreview(
    dto: GeneratePreviewDto,
    user: User,
  ): Promise<{ imageUrl: string; prompt: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`, {
      brandId: dto.brandId,
      contentType: dto.contentType,
    });

    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization?.toString();
    const userId = publicMetadata.user?.toString();

    if (!organizationId || !userId) {
      throw new HttpException(
        {
          detail: 'Missing organization or user context',
          title: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // 1. Fetch brand data
      const brand = await this.brandsService.findOne(
        {
          _id: new Types.ObjectId(dto.brandId),
          isDeleted: false,
          organization: new Types.ObjectId(organizationId),
        },
        'none',
      );

      if (!brand) {
        throw new HttpException(
          { detail: 'Brand not found', title: 'Not Found' },
          HttpStatus.NOT_FOUND,
        );
      }

      // 2. Check credits availability
      const hasCredits =
        await this.creditsUtilsService.checkOrganizationCreditsAvailable(
          organizationId,
          ONBOARDING_PREVIEW_CREDIT_COST,
        );

      if (!hasCredits) {
        throw new HttpException(
          {
            detail: 'Insufficient credits for preview generation',
            title: 'Insufficient Credits',
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      // 3. Build prompt based on content type
      const prompt = this.buildPreviewPrompt(
        dto.contentType,
        brand.label || '',
        brand.description || '',
        brand.primaryColor || '',
        brand.secondaryColor || '',
      );

      // 4. Generate image via ComfyUI
      this.loggerService.log(`${caller} generating image via ComfyUI`, {
        contentType: dto.contentType,
      });

      const { imageBuffer } = await this.comfyUIService.generateImage(
        MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO,
        {
          height: 1024,
          prompt,
          steps: 4,
          width: 1024,
        },
      );

      // 5. Upload to S3
      const uploadKey = `${organizationId}/onboarding-preview-${Date.now()}`;
      const { publicUrl } = await this.filesClientService.getPresignedUploadUrl(
        uploadKey,
        'onboarding',
        'image/png',
      );

      await this.filesClientService.uploadToS3(uploadKey, 'onboarding', {
        contentType: 'image/png',
        data: imageBuffer,
        type: FileInputType.BUFFER,
      });

      // 6. Deduct credits
      await this.creditsUtilsService.deductCreditsFromOrganization(
        organizationId,
        userId,
        ONBOARDING_PREVIEW_CREDIT_COST,
        'Onboarding preview image',
      );

      // 7. Save preview URL to brand
      await this.brandsService.patch(brand._id, {
        // @ts-expect-error onboardingPreviewUrl is valid
        onboardingPreviewUrl: publicUrl,
      });

      this.loggerService.log(`${caller} completed`, {
        brandId: dto.brandId,
        imageUrl: publicUrl,
      });

      return { imageUrl: publicUrl, prompt };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          detail: (error as Error)?.message || 'Failed to generate preview',
          title: 'Preview Generation Failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Build a prompt for onboarding preview image generation
   */
  private buildPreviewPrompt(
    contentType: string,
    brandName: string,
    brandDescription: string,
    primaryColor: string,
    secondaryColor: string,
  ): string {
    if (contentType === 'ads') {
      return `A stunning high-end advertisement for ${brandName}, ${brandDescription}, featuring a professional model presenting the brand, brand colors ${primaryColor} and ${secondaryColor}, commercial product photography, studio lighting, high fashion`;
    }

    return `A premium social media content post for ${brandName}, ${brandDescription}, featuring an attractive influencer promoting the brand, brand colors ${primaryColor} and ${secondaryColor}, Instagram lifestyle photography, natural lighting, aspirational`;
  }

  /**
   * Add reference images to a brand
   */
  async addReferenceImages(
    brandId: string,
    images: ReferenceImageDto[],
    user: User,
  ): Promise<{ success: boolean; count: number }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`, { brandId });

    const publicMetadata = getPublicMetadata(user);
    const organizationId = new Types.ObjectId(publicMetadata.organization);

    const brand = await this.brandsService.findOne(
      {
        _id: new Types.ObjectId(brandId),
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

    await this.brandsService.patchAll(
      { _id: brand._id },
      { $push: { referenceImages: { $each: images } } },
    );

    this.loggerService.log(`${caller} completed`, {
      brandId,
      count: images.length,
    });

    return { count: images.length, success: true };
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

    const publicMetadata = getPublicMetadata(user);
    const organizationId = new Types.ObjectId(publicMetadata.organization);
    const userId = new Types.ObjectId(publicMetadata.user);

    try {
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

      await this.brandsService.patch(brand._id, {
        label: dto.brandName,
      });

      const slug = await this.organizationsService.generateUniqueSlug(
        dto.brandName,
      );
      await this.organizationsService.patch(organizationId.toString(), {
        label: dto.brandName,
        slug,
      });

      this.loggerService.log(`${caller} completed`);

      return {
        message: 'Brand name updated successfully',
        success: true,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        { detail: 'Failed to update brand name', title: 'Error' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Update brand entity with scraped data
   */
  private async updateBrandWithScrapedData(
    brandId: Types.ObjectId,
    scrapedData: IScrapedBrandData,
    dto: BrandSetupDto,
    labelOverride?: string,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};

    const label = labelOverride || scrapedData.companyName;
    if (label) {
      updateData.label = label;
    }

    if (scrapedData.description) {
      updateData.description = scrapedData.description;
    }

    if (scrapedData.primaryColor) {
      updateData.primaryColor = scrapedData.primaryColor;
    }

    if (scrapedData.secondaryColor) {
      updateData.secondaryColor = scrapedData.secondaryColor;
    }

    if (scrapedData.fontFamily) {
      updateData.fontFamily = scrapedData.fontFamily;
    }

    // Build system prompt from scraped content
    if (scrapedData.tagline || scrapedData.aboutText) {
      const systemPromptParts: string[] = [];

      if (scrapedData.companyName) {
        systemPromptParts.push(
          `You are creating content for ${scrapedData.companyName}.`,
        );
      }

      if (scrapedData.tagline) {
        systemPromptParts.push(`Brand tagline: "${scrapedData.tagline}"`);
      }

      if (scrapedData.aboutText) {
        systemPromptParts.push(`About the brand: ${scrapedData.aboutText}`);
      }

      if (dto.industry) {
        systemPromptParts.push(`Industry: ${dto.industry}`);
      }

      if (dto.targetAudience) {
        systemPromptParts.push(`Target audience: ${dto.targetAudience}`);
      }

      updateData.text = systemPromptParts.join('\n\n');
    }

    if (Object.keys(updateData).length > 0) {
      // @ts-expect-error TS2345
      await this.brandsService.patch(brandId, updateData);
    }
  }

  private async updateBrandGuidance(
    brandId: Types.ObjectId,
    extractedData: IExtractedBrandData,
  ): Promise<void> {
    const brand = await this.brandsService.findOne({
      _id: brandId,
      isDeleted: false,
    });

    if (!brand) {
      return;
    }

    const extractedVoice = extractedData.brandVoice as
      | {
          audience?: string;
          doNotSoundLike?: string[];
          hashtags?: string[];
          messagingPillars?: string[];
          sampleOutput?: string;
          taglines?: string[];
          tone?: string;
          values?: string[];
          voice?: string;
        }
      | undefined;

    const nextVoice = extractedData.brandVoice
      ? {
          ...(brand.agentConfig?.voice ?? {}),
          audience: extractedVoice?.audience
            ? extractedVoice.audience
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean)
            : (brand.agentConfig?.voice?.audience ?? []),
          doNotSoundLike: extractedVoice?.doNotSoundLike ?? [],
          hashtags: extractedVoice?.hashtags ?? [],
          messagingPillars: extractedVoice?.messagingPillars ?? [],
          sampleOutput: extractedVoice?.sampleOutput,
          style: extractedVoice?.voice,
          taglines: extractedVoice?.taglines ?? [],
          tone: extractedVoice?.tone,
          values: extractedVoice?.values ?? [],
        }
      : brand.agentConfig?.voice;

    await this.brandsService.patch(brandId, {
      agentConfig: {
        ...(brand.agentConfig ?? {}),
        ...(nextVoice ? { voice: nextVoice } : {}),
      },
    });
  }

  private async updateBrandGuidanceOverrides(
    brandId: Types.ObjectId,
    dto: ConfirmBrandDataDto,
  ): Promise<void> {
    const brand = await this.brandsService.findOne({
      _id: brandId,
      isDeleted: false,
    });

    if (!brand) {
      return;
    }

    const existingVoice = brand.agentConfig?.voice ?? {};

    await this.brandsService.patch(brandId, {
      agentConfig: {
        ...(brand.agentConfig ?? {}),
        voice: {
          ...existingVoice,
          ...(dto.audience
            ? {
                audience: dto.audience
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean),
              }
            : {}),
          ...(dto.tone ? { tone: dto.tone } : {}),
          ...(dto.voice ? { style: dto.voice } : {}),
        },
      },
    });
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
    const organizationId = new Types.ObjectId(publicMetadata.organization);

    try {
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
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        { detail: 'Failed to set organization prefix', title: 'Error' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Mark onboarding as complete (set isFirstLogin to false)
   */
  private async completeOnboarding(
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const settings = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: organizationId,
    });

    if (settings) {
      await this.organizationSettingsService.patch(settings._id, {
        isFirstLogin: false,
      });
    }
  }
}
