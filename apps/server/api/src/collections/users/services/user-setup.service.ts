/**
 * User Setup Service
 * Handles all initialization logic after a user is created.
 * This service is called after user creation to set up:
 * - Default organization
 * - Organization settings
 * - User settings
 * - Default brand
 * - Credit balance
 * - Member record
 */
import { BrandEntity } from '@api/collections/brands/entities/brand.entity';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MemberEntity } from '@api/collections/members/entities/member.entity';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingEntity } from '@api/collections/organization-settings/entities/organization-setting.entity';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationEntity } from '@api/collections/organizations/entities/organization.entity';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { SettingEntity } from '@api/collections/settings/entities/setting.entity';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { generateLabel } from '@api/shared/utils/label/label.util';
import { OrganizationCategory } from '@genfeedai/enums';
import { ONBOARDING_SIGNUP_GIFT_CREDITS } from '@genfeedai/types';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

export interface UserSetupResult {
  organization: OrganizationEntity;
  organizationSettings: OrganizationSettingEntity;
  userSettings: SettingEntity;
  brand: BrandEntity;
  member: MemberEntity;
}

@Injectable()
export class UserSetupService {
  private readonly context = 'UserSetupService';

  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly brandsService: BrandsService,
    private readonly membersService: MembersService,
    private readonly rolesService: RolesService,
    private readonly settingsService: SettingsService,
    private readonly creditBalanceService: CreditBalanceService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Initialize all required resources for a newly created user.
   * This is called after user creation (for non-invited users).
   *
   * @param userId - The user's ObjectId
   * @returns UserSetupResult with all created entities
   * @throws Error if any critical step fails (cascading failure)
   */
  async initializeUserResources(
    userId: Types.ObjectId,
    category?: OrganizationCategory,
  ): Promise<UserSetupResult> {
    let organization: OrganizationEntity | null = null;
    let organizationSettings: OrganizationSettingEntity | null = null;
    let userSettings: SettingEntity | null = null;
    let brand: BrandEntity | null = null;
    let member: MemberEntity | null = null;
    try {
      // Step 1: Create organization (REQUIRED - cascading failure)
      const organizationResult = await this.getOrCreateOrganization(
        userId,
        category,
      );
      organization = organizationResult.organization;

      // Step 2: Create organization settings (REQUIRED - cascading failure)
      organizationSettings = await this.getOrCreateOrganizationSettings(
        organization._id,
      );

      // Step 3: Create user settings (REQUIRED - cascading failure)
      userSettings = await this.getOrCreateUserSettings(userId);

      // Step 4: Create brand (REQUIRED - cascading failure)
      brand = await this.getOrCreateBrand(organization._id, userId);

      // Step 5: Create credit balance (REQUIRED - cascading failure)
      await this.creditBalanceService.getOrCreateBalance(
        organization._id.toString(),
      );
      this.logger.log(
        `Created credit balance for organization ${organization._id}`,
        this.context,
      );

      if (organizationResult.wasCreated) {
        await this.awardSignupGiftCredits(organization._id);
      }

      // Step 6: Create member (REQUIRED - cascading failure)
      member = await this.getOrCreateMember(organization._id, userId);

      // Log success summary
      this.logger.log(
        `User setup completed for user ${userId} - org: ${organization._id}, brand: ${brand._id}, member: ${member._id}`,
        this.context,
      );

      return {
        brand,
        member,
        organization,
        organizationSettings,
        userSettings,
      };
    } catch (error: unknown) {
      // CASCADING FAILURE: Log error and rethrow
      this.logger.error(`CRITICAL: User setup failed for user ${userId}`, {
        brandCreated: !!brand,
        error: (error as Error)?.message,
        errorName: (error as Error)?.name,
        errorStack: (error as Error)?.stack,
        memberCreated: !!member,
        organizationCreated: !!organization,
        organizationSettingsCreated: !!organizationSettings,
        userId: userId.toString(),
        userSettingsCreated: !!userSettings,
      });
      throw error;
    }
  }

  private async getOrCreateOrganization(
    userId: Types.ObjectId,
    category?: OrganizationCategory,
  ): Promise<{ organization: OrganizationEntity; wasCreated: boolean }> {
    const existing = await this.organizationsService.findOne({
      isDeleted: false,
      user: userId,
    });

    if (existing) {
      this.logger.warn(
        `Organization already exists for user ${userId}`,
        this.context,
      );
      return { organization: existing, wasCreated: false };
    }

    this.logger.log(`Creating organization for user ${userId}`, this.context);

    const label = 'Default Organization';
    const slug = await this.organizationsService.generateUniqueSlug(label);

    const organization = await this.organizationsService.create(
      new OrganizationEntity({
        category: category || OrganizationCategory.BUSINESS,
        isSelected: true,
        label,
        slug,
        user: userId,
      }),
    );

    if (!organization?._id) {
      throw new Error(
        `Organization creation failed for user ${userId} - _id is missing`,
      );
    }

    this.logger.log(
      `Created organization ${organization._id} for user ${userId}`,
      this.context,
    );

    return { organization, wasCreated: true };
  }

  private async awardSignupGiftCredits(
    organizationId: Types.ObjectId,
  ): Promise<void> {
    const organizationIdString = organizationId.toString();
    const existingCredits =
      await this.creditsUtilsService.getOrganizationCreditsWithExpiration(
        organizationIdString,
      );
    const hasSignupGift = existingCredits.credits.some(
      (entry) => entry.source === 'onboarding-signup-gift',
    );

    if (hasSignupGift) {
      return;
    }

    await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
      organizationIdString,
      ONBOARDING_SIGNUP_GIFT_CREDITS,
      'onboarding-signup-gift',
      'Signup gift credits',
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    );

    this.logger.log(
      `Awarded signup gift credits for organization ${organizationIdString}`,
      this.context,
    );
  }

  private async getOrCreateOrganizationSettings(
    organizationId: Types.ObjectId,
  ): Promise<OrganizationSettingEntity> {
    const existing = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: organizationId,
    });

    if (existing) {
      this.logger.warn(
        `Organization settings already exist for organization ${organizationId}`,
        this.context,
      );
      return existing;
    }

    const enabledModelIds =
      await this.organizationSettingsService.getLatestMajorVersionModelIds();

    const orgSettings = await this.organizationSettingsService.create(
      new OrganizationSettingEntity({
        brandsLimit: 5,
        enabledModels: enabledModelIds,
        isAutoEvaluateEnabled: false,
        isGenerateArticlesEnabled: false,
        isGenerateImagesEnabled: true,
        isGenerateMusicEnabled: true,
        isGenerateVideosEnabled: true,
        isNotificationsDiscordEnabled: false,
        isNotificationsEmailEnabled: true,
        isVerifyIngredientEnabled: true,
        isVerifyScriptEnabled: true,
        isVerifyVideoEnabled: true,
        isVoiceControlEnabled: false,
        isWatermarkEnabled: true,
        isWebhookEnabled: false,
        isWhitelabelEnabled: false,
        organization: organizationId,
        seatsLimit: 3,
        timezone: 'UTC',
      }),
    );

    this.logger.log(
      `Created organization settings ${orgSettings._id} with ${enabledModelIds.length} enabled models`,
      this.context,
    );

    return orgSettings;
  }

  private async getOrCreateUserSettings(
    userId: Types.ObjectId,
  ): Promise<SettingEntity> {
    const existing = await this.settingsService.findOne({
      isDeleted: false,
      user: userId,
    });

    if (existing) {
      this.logger.warn(
        `User settings already exist for user ${userId}`,
        this.context,
      );
      return existing;
    }

    const settings = await this.settingsService.create(
      new SettingEntity({
        favoriteModelKeys: [],
        isAdvancedMode: true,
        isFirstLogin: true,
        isMenuCollapsed: false,
        isSidebarProgressCollapsed: false,
        isVerified: false,
        theme: 'dark',
        user: userId,
      }),
    );

    this.logger.log(`Created user settings for user ${userId}`, this.context);

    return settings;
  }

  private async getOrCreateBrand(
    organizationId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<BrandEntity> {
    const existing = await this.brandsService.findOne({
      isDeleted: false,
      organization: organizationId,
    });

    if (existing) {
      this.logger.warn(
        `Brand already exists for organization ${organizationId}`,
        this.context,
      );
      return existing;
    }

    const brand = await this.brandsService.create(
      new BrandEntity({
        backgroundColor: '#000000',
        description: 'Default description. Use it as a pre-prompt',
        fontFamily: 'montserrat-black',
        handle: generateLabel('brand'),
        isSelected: true,
        label: 'Default Organization',
        organization: organizationId,
        primaryColor: '#000000',
        secondaryColor: '#FFFFFF',
        user: userId,
      }),
    );

    this.logger.log(
      `Created brand ${brand._id} for organization ${organizationId}`,
      this.context,
    );

    return brand;
  }

  private async getOrCreateMember(
    organizationId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<MemberEntity> {
    const existing = await this.membersService.findOne({
      isDeleted: false,
      organization: organizationId,
      user: userId,
    });

    if (existing) {
      this.logger.warn(
        `Member already exists for user ${userId} in organization ${organizationId}`,
        this.context,
      );
      return existing;
    }

    // Look up admin role first, fallback to user role
    let roleToAssign = await this.rolesService.findOne({
      isDeleted: false,
      key: 'admin',
    });

    if (!roleToAssign) {
      roleToAssign = await this.rolesService.findOne({
        isDeleted: false,
        key: 'user',
      });
    }

    if (!roleToAssign) {
      throw new Error(
        `No valid role found (admin or user) to assign to member for user ${userId}`,
      );
    }

    const member = await this.membersService.create(
      new MemberEntity({
        isActive: true,
        organization: organizationId,
        role: new Types.ObjectId(roleToAssign._id),
        user: userId,
      }),
    );

    this.logger.log(
      `Created member for user ${userId} in organization ${organizationId} with role ${roleToAssign.key}`,
      this.context,
    );

    return member;
  }
}
