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

import type { MemberDocument } from '@api/collections/members/schemas/member.schema';
import { MembersService } from '@api/collections/members/services/members.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { DEFAULT_THEME } from '@genfeedai/constants';
import { MemberRole, OrganizationCategory } from '@genfeedai/enums';
import { resolveSignupWorkspaceLabel } from '@genfeedai/helpers';
import { ONBOARDING_SIGNUP_GIFT_CREDITS } from '@genfeedai/types';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { BillingAccountsService } from '@server/collections/billing-accounts/services/billing-accounts.service';
import type { BrandDocument } from '@server/collections/brands/schemas/brand.schema';
import { BrandsService } from '@server/collections/brands/services/brands.service';
import { CreditBalanceService } from '@server/collections/credits/services/credit-balance.service';
import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import type { OrganizationSettingDocument } from '@server/collections/organization-settings/schemas/organization-setting.schema';
import { OrganizationSettingsService } from '@server/collections/organization-settings/services/organization-settings.service';
import type { OrganizationDocument } from '@server/collections/organizations/schemas/organization.schema';
import { OrganizationsService } from '@server/collections/organizations/services/organizations.service';
import type { SettingDocument } from '@server/collections/settings/schemas/setting.schema';
import { SettingsService } from '@server/collections/settings/services/settings.service';

export interface UserSetupProfile {
  email?: string | null;
  name?: string | null;
}

export interface UserSetupResult {
  organization: OrganizationDocument;
  organizationSettings: OrganizationSettingDocument;
  userSettings: SettingDocument;
  brand: BrandDocument;
  member: MemberDocument;
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
    private readonly billingAccountsService: BillingAccountsService,
    private readonly creditBalanceService: CreditBalanceService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Initialize all required resources for a newly created user.
   * This is called after user creation (for non-invited users).
   *
   * @param userId - The user's canonical id
   * @returns UserSetupResult with all created entities
   * @throws Error if any critical step fails (cascading failure)
   */
  async initializeUserResources(
    userId: string,
    category?: OrganizationCategory,
    profile?: UserSetupProfile,
  ): Promise<UserSetupResult> {
    let organization: OrganizationDocument | null = null;
    let organizationSettings: OrganizationSettingDocument | null = null;
    let userSettings: SettingDocument | null = null;
    let brand: BrandDocument | null = null;
    let member: MemberDocument | null = null;
    try {
      // Step 1: Create organization (REQUIRED - cascading failure)
      const workspaceLabel = resolveSignupWorkspaceLabel({
        email: profile?.email,
        name: profile?.name,
      });
      const organizationResult = await this.getOrCreateOrganization(
        userId,
        category,
        workspaceLabel,
      );
      organization = organizationResult.organization;

      // Step 2: Create organization settings (REQUIRED - cascading failure)
      organizationSettings = await this.getOrCreateOrganizationSettings(
        organization.id,
      );

      // Step 3: Create user settings (REQUIRED - cascading failure)
      userSettings = await this.getOrCreateUserSettings(userId);

      // Step 4: Create brand (REQUIRED - cascading failure)
      brand = await this.getOrCreateBrand(
        organization.id,
        userId,
        workspaceLabel,
      );

      // Default daily post/newsletter/image workflows are no longer
      // auto-provisioned. Operators create schedules from Automation when they
      // want them.

      // Billing-account linking verifies that the caller administers the
      // organization. Establish the canonical membership before invoking that
      // authorization boundary so first-time signup can finish provisioning.
      member = await this.getOrCreateMember(organization.id, userId);

      await this.billingAccountsService.ensureForOrganization({
        label: organization.label,
        organizationId: organization.id.toString(),
        planTier: organizationSettings.subscriptionTier ?? null,
        userId,
      });

      // Create credit balance (REQUIRED - cascading failure)
      await this.creditBalanceService.getOrCreateBalance(
        organization.id.toString(),
      );
      this.logger.log(
        `Created credit balance for organization ${organization.id}`,
        this.context,
      );

      if (organizationResult.wasCreated) {
        await this.awardSignupGiftCredits(organization.id);
      }

      // Log success summary
      this.logger.log(
        `User setup completed for user ${userId} - org: ${organization.id}, brand: ${brand.id}, member: ${member.id}`,
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

  /**
   * Resolve the organization a user already belongs to via the `members`
   * collection — the source of truth that findMine and switchOrganization use.
   * Returns null when the user has no active membership or the referenced org
   * is missing/deleted.
   */
  private async findMembershipOrganization(
    userId: string,
  ): Promise<OrganizationDocument | null> {
    const membership = await this.membersService.findOne({
      isActive: true,
      userId: userId,
    });

    // Scalar FK: the legacy `organization` alias is undefined unless the query
    // populated the relation, so reading it here would make every membership
    // look orgless and spawn a duplicate organization on each setup run.
    if (!membership?.organizationId) {
      return null;
    }

    return this.organizationsService.findOne({
      id: membership.organizationId,
    });
  }

  private async getOrCreateOrganization(
    userId: string,
    category?: OrganizationCategory,
    workspaceLabel?: string,
  ): Promise<{ organization: OrganizationDocument; wasCreated: boolean }> {
    // Membership is the source of truth for org access — findMine and
    // switchOrganization both resolve a user's orgs via the `members`
    // collection. Dedupe on membership first so a stale or missing legacy
    // `Organization.user` ownership field can't spawn a second
    // "Default Organization" for a user who already belongs to one (#1227).
    const memberOrganization = await this.findMembershipOrganization(userId);

    if (memberOrganization) {
      this.logger.warn(
        `Organization already exists (via membership) for user ${userId}`,
        this.context,
      );
      return { organization: memberOrganization, wasCreated: false };
    }

    // Legacy fallback: organizations created before membership became the
    // source of truth are keyed by the `user` ownership field.
    const existing = await this.organizationsService.findOne({
      userId: userId,
    });

    if (existing) {
      this.logger.warn(
        `Organization already exists for user ${userId}`,
        this.context,
      );
      return { organization: existing, wasCreated: false };
    }

    this.logger.log(`Creating organization for user ${userId}`, this.context);

    const label = workspaceLabel || resolveSignupWorkspaceLabel({});
    const slug = await this.organizationsService.generateUniqueSlug(label);

    const organization = await this.organizationsService.create({
      category: category || OrganizationCategory.BUSINESS,
      isSelected: true,
      label,
      slug,
      userId,
    });

    if (!organization?.id) {
      throw new Error(
        `Organization creation failed for user ${userId} - id is missing`,
      );
    }

    this.logger.log(
      `Created organization ${organization.id} for user ${userId}`,
      this.context,
    );

    return { organization, wasCreated: true };
  }

  private async awardSignupGiftCredits(organizationId: string): Promise<void> {
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
    organizationId: string,
  ): Promise<OrganizationSettingDocument> {
    return this.organizationSettingsService.ensureForOrganization(
      organizationId,
    );
  }

  private async getOrCreateUserSettings(
    userId: string,
  ): Promise<SettingDocument> {
    const existing = await this.settingsService.findOne({
      userId: userId,
    });

    if (existing) {
      this.logger.warn(
        `User settings already exist for user ${userId}`,
        this.context,
      );
      return existing;
    }

    const settings = await this.settingsService.create({
      favoriteModelKeys: [],
      isAdvancedMode: true,
      isFirstLogin: true,
      isMenuCollapsed: false,
      isSidebarProgressCollapsed: false,
      isVerified: false,
      theme: DEFAULT_THEME,
      userId,
    } as unknown as Parameters<typeof this.settingsService.create>[0]);

    this.logger.log(`Created user settings for user ${userId}`, this.context);

    return settings;
  }

  private async getOrCreateBrand(
    organizationId: string,
    userId: string,
    workspaceLabel?: string,
  ): Promise<BrandDocument> {
    const existing = await this.brandsService.findOne({
      organizationId: organizationId,
    });

    if (existing) {
      this.logger.warn(
        `Brand already exists for organization ${organizationId}`,
        this.context,
      );
      return existing;
    }

    const label = workspaceLabel || resolveSignupWorkspaceLabel({});
    const slug = await this.brandsService.generateUniqueSlug(label);
    const brand = await this.brandsService.create({
      backgroundColor: '#000000',
      description: 'Default description. Use it as a pre-prompt',
      fontFamily: 'montserrat-black',
      isSelected: true,
      label,
      organizationId,
      primaryColor: '#000000',
      secondaryColor: '#FFFFFF',
      slug,
      userId,
    } as unknown as Parameters<typeof this.brandsService.create>[0]);

    this.logger.log(
      `Created brand ${brand.id} for organization ${organizationId}`,
      this.context,
    );

    return brand;
  }

  private async getOrCreateMember(
    organizationId: string,
    userId: string,
  ): Promise<MemberDocument> {
    const existing = await this.membersService.findOne({
      organizationId: organizationId,
      userId: userId,
    });

    if (existing) {
      if (existing.isActive === false) {
        const memberId = existing.id;
        const reactivated = await this.membersService.patch(memberId, {
          isActive: true,
        });

        this.logger.warn(
          `Reactivated inactive member for user ${userId} in organization ${organizationId}`,
          this.context,
        );
        return reactivated;
      }

      this.logger.warn(
        `Member already exists for user ${userId} in organization ${organizationId}`,
        this.context,
      );
      return existing;
    }

    const roleToAssign = await this.resolveSignupMemberRole();

    const member = await this.membersService.create({
      isActive: true,
      organizationId,
      roleId: String(roleToAssign.id),
      roleKey: roleToAssign.key,
      userId,
    } as unknown as Parameters<typeof this.membersService.create>[0]);

    this.logger.log(
      `Created member for user ${userId} in organization ${organizationId} with role ${roleToAssign.key}`,
      this.context,
    );

    return member;
  }

  /**
   * Prefer admin, then owner (the role self-hosted seed always creates). Both
   * roles satisfy the organization-administration boundary required while
   * linking the signup workspace to its billing account. If the catalog is
   * empty, create admin so first-time signup can still attach a membership row.
   */
  private async resolveSignupMemberRole(): Promise<{
    id: string;
    key: string;
  }> {
    const roleKeys = [MemberRole.ADMIN, MemberRole.OWNER];

    for (const key of roleKeys) {
      const role = await this.rolesService.findOne({ key });
      if (role?.id) {
        return { id: String(role.id), key: role.key };
      }
    }

    const created = await this.rolesService.create({
      key: MemberRole.ADMIN,
      label: 'Admin',
    });

    return { id: String(created.id), key: created.key };
  }
}
