import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { MemberEntity } from '@api/collections/members/entities/member.entity';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationEntity } from '@api/collections/organizations/entities/organization.entity';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { SettingEntity } from '@api/collections/settings/entities/setting.entity';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { UserEntity } from '@api/collections/users/entities/user.entity';
import { type UserDocument } from '@api/collections/users/schemas/user.schema';
import { UsersService } from '@api/collections/users/services/users.service';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { generateLabel } from '@api/shared/utils/label/label.util';
import type { UserJSON, WebhookEvent } from '@clerk/backend';
import { AppSource, OrganizationCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
} from '@nestjs/common';

// Name of the shared organization for getshareable.app consumers
const GETSHAREABLE_ORG_NAME = 'GetShareable';

type ClerkWebhookRecord = Record<string, unknown>;

const SUPPORTED_ORGANIZATION_EVENTS = new Set([
  'organization.created',
  'organization.updated',
  'organization.deleted',
  'organization.logo.updated',
  'organization.logo.deleted',
  'organization.metadata.updated',
]);

const SUPPORTED_MEMBERSHIP_EVENTS = new Set([
  'organization_membership.created',
  'organization_membership.updated',
  'organization_membership.deleted',
  'organization_membership.metadata.updated',
  'organizationMembership.created',
  'organizationMembership.updated',
  'organizationMembership.deleted',
  'organizationMembership.metadata.updated',
]);

const SUPPORTED_INVITATION_EVENTS = new Set([
  'organizationInvitation.created',
  'organizationInvitation.accepted',
  'organizationInvitation.revoked',
  'organization_invitation.created',
  'organization_invitation.accepted',
  'organization_invitation.revoked',
]);

@Injectable()
export class ClerkWebhookService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly clerkService: ClerkService,
    private readonly usersService: UsersService,
    private readonly organizationsService: OrganizationsService,
    private readonly brandsService: BrandsService,
    private readonly membersService: MembersService,
    private readonly notificationsService: NotificationsService,
    private readonly rolesService: RolesService,
    private readonly settingsService: SettingsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    @Optional() private readonly transactionUtil?: TransactionUtil,
    @Optional() private readonly activitiesService?: ActivitiesService,
  ) {}

  private isRecord(value: unknown): value is ClerkWebhookRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private readString(
    record: ClerkWebhookRecord | null | undefined,
    keys: string[],
  ): string {
    for (const key of keys) {
      const value = record?.[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }

    return '';
  }

  private readRecord(
    record: ClerkWebhookRecord | null | undefined,
    keys: string[],
  ): ClerkWebhookRecord | null {
    for (const key of keys) {
      const value = record?.[key];
      if (this.isRecord(value)) {
        return value;
      }
    }

    return null;
  }

  private readPublicMetadata(
    record: ClerkWebhookRecord | null | undefined,
  ): ClerkWebhookRecord {
    return this.readRecord(record, ['public_metadata', 'publicMetadata']) ?? {};
  }

  private getDocumentId(record: unknown): string {
    if (!this.isRecord(record)) {
      return '';
    }

    return this.readString(record, ['_id', 'id']);
  }

  private getClerkOrganizationIdFromMembership(
    data: ClerkWebhookRecord,
  ): string {
    const organization = this.readRecord(data, [
      'organization',
      'organization_data',
      'organizationData',
    ]);

    return (
      this.readString(organization, ['id']) ||
      this.readString(data, [
        'organization_id',
        'organizationId',
        'org_id',
        'orgId',
      ])
    );
  }

  private getClerkUserIdFromMembership(data: ClerkWebhookRecord): string {
    const publicUserData = this.readRecord(data, [
      'public_user_data',
      'publicUserData',
    ]);

    return (
      this.readString(publicUserData, ['user_id', 'userId', 'id']) ||
      this.readString(data, ['user_id', 'userId'])
    );
  }

  private async findUserProjection(
    clerkUserId: string,
    metadata: ClerkWebhookRecord = {},
  ): Promise<UserDocument | null> {
    const metadataUserId = this.readString(metadata, ['userId', 'user']);
    if (metadataUserId) {
      const user = await this.usersService.findOne({
        _id: metadataUserId,
        isDeleted: false,
      });
      if (user) {
        return user;
      }
    }

    return clerkUserId
      ? await this.usersService.findOne({
          clerkId: clerkUserId,
          isDeleted: false,
        })
      : null;
  }

  private async getOrCreateUserProjection(
    clerkUserId: string,
    metadata: ClerkWebhookRecord = {},
    publicUserData: ClerkWebhookRecord | null = null,
  ): Promise<UserDocument | null> {
    const existing = await this.findUserProjection(clerkUserId, metadata);
    if (existing) {
      return existing;
    }

    if (!clerkUserId) {
      return null;
    }

    try {
      const clerkUser = await this.clerkService.getUser(clerkUserId, {
        skipCache: true,
      });
      const email =
        clerkUser.emailAddresses?.[0]?.emailAddress ||
        this.readString(publicUserData, ['identifier', 'email']);

      return await this.usersService.create(
        new UserEntity({
          appSource: AppSource.GENFEED,
          avatar: clerkUser.imageUrl || undefined,
          clerkId: clerkUserId,
          email: email || undefined,
          firstName:
            clerkUser.firstName ||
            this.readString(publicUserData, ['first_name', 'firstName']) ||
            undefined,
          handle: generateLabel('user'),
          lastName:
            clerkUser.lastName ||
            this.readString(publicUserData, ['last_name', 'lastName']) ||
            undefined,
        }) as Parameters<UsersService['create']>[0],
      );
    } catch (error: unknown) {
      this.loggerService.warn(
        `Unable to create local user projection for Clerk user ${clerkUserId}`,
        { error: error instanceof Error ? error.message : error },
      );
      return null;
    }
  }

  /**
   * Detect Prisma's "record required but not found" failure (P2025), which
   * `BaseService.patch`/`update` surfaces when the target row disappeared
   * between our read and the write.
   */
  private isRecordNotFoundError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2025'
    );
  }

  /**
   * Patch a user projection idempotently. Clerk redelivers and retries
   * webhooks, so the projection can be removed by a concurrent event between
   * our lookup and this update. A vanished record resolves to `null` (logged)
   * instead of a P2025 that would 404 the callback and trigger an endless
   * Clerk retry loop.
   */
  private async patchUserProjection(
    id: string,
    update: Parameters<UsersService['patch']>[1],
  ): Promise<UserDocument | null> {
    try {
      return await this.usersService.patch(id, update);
    } catch (error: unknown) {
      if (this.isRecordNotFoundError(error)) {
        this.loggerService.warn(
          `Skipped user projection patch for ${id}; record no longer exists (concurrent Clerk event)`,
          { id },
        );
        return null;
      }

      throw error;
    }
  }

  private async findOrganizationProjection(
    clerkOrganizationId: string,
    metadata: ClerkWebhookRecord = {},
  ): Promise<OrganizationDocument | null> {
    if (clerkOrganizationId) {
      const organization = await this.organizationsService.findOne({
        clerkOrganizationId,
      });
      if (organization) {
        return organization;
      }
    }

    const metadataOrganizationId = this.readString(metadata, [
      'genfeedOrganizationId',
      'organizationId',
      'organization',
    ]);
    if (!metadataOrganizationId) {
      return null;
    }

    return await this.organizationsService.findOne({
      _id: metadataOrganizationId,
    });
  }

  private async getOrCreateOrganizationSettings(
    organizationId: string,
  ): Promise<void> {
    const existing = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: organizationId,
    });
    if (existing) {
      return;
    }

    const enabledModelIds =
      await this.organizationSettingsService.getLatestMajorVersionModelIds();

    await this.organizationSettingsService.create({
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
      organizationId,
      seatsLimit: 3,
      timezone: 'UTC',
    } as unknown as Parameters<OrganizationSettingsService['create']>[0]);
  }

  private async getOrCreateDefaultBrand(
    organizationId: string,
    userId: string,
    label: string,
  ): Promise<string | undefined> {
    const existing = await this.brandsService.findOne({
      isDeleted: false,
      organization: organizationId,
    });
    if (existing?._id) {
      return existing._id.toString();
    }

    const brand = await this.brandsService.create({
      backgroundColor: '#000000',
      description: 'Default description. Use it as a pre-prompt',
      fontFamily: 'montserrat-black',
      isSelected: true,
      label,
      organizationId,
      primaryColor: '#000000',
      secondaryColor: '#FFFFFF',
      slug: generateLabel('brand'),
      userId,
    } as unknown as Parameters<BrandsService['create']>[0]);

    return brand?._id?.toString();
  }

  private getRoleLookupKeysForClerkRole(role: string): string[] {
    const normalizedRole = role.replace(/^org:/, '').toLowerCase();
    if (normalizedRole.includes('admin')) {
      return ['admin', 'owner', 'member', 'user'];
    }

    return ['member', 'user', 'admin'];
  }

  private async recordClerkActivity(params: {
    clerkOrganizationId?: string;
    clerkMembershipId?: string;
    eventType: string;
    organizationId?: string;
    role?: string;
    userId?: string;
  }): Promise<void> {
    if (!this.activitiesService || !params.organizationId) {
      return;
    }

    try {
      await this.activitiesService.create({
        data: {
          clerkMembershipId: params.clerkMembershipId,
          clerkOrganizationId: params.clerkOrganizationId,
          eventType: params.eventType,
          role: params.role,
        },
        key: params.eventType,
        organizationId: params.organizationId,
        source: 'clerk',
        userId: params.userId,
      });
    } catch (error: unknown) {
      this.loggerService.warn('Failed to record Clerk activity', {
        error: error instanceof Error ? error.message : error,
        eventType: params.eventType,
      });
    }
  }

  async handleWebhookEvent(event: WebhookEvent, url: string) {
    const { type } = event;

    if (type.startsWith('user.')) {
      await this.handleUserWebhookEvent(event, url);
      return;
    }

    if (SUPPORTED_ORGANIZATION_EVENTS.has(type)) {
      await this.handleOrganizationWebhookEvent(event, url);
      return;
    }

    if (SUPPORTED_MEMBERSHIP_EVENTS.has(type)) {
      await this.handleMembershipWebhookEvent(event, url);
      return;
    }

    if (SUPPORTED_INVITATION_EVENTS.has(type)) {
      await this.handleInvitationWebhookEvent(event, url);
      return;
    }

    const detail = `Event type '${type}' is not supported. Supported Clerk webhook events are user.*, organization.*, organizationMembership.*, organization_membership.*, organizationInvitation.*, and organization_invitation.*.`;
    this.loggerService.warn(`${url} rejected`, { detail, type });

    throw new HttpException(
      {
        detail,
        title: 'Unsupported event type',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  private async handleUserWebhookEvent(event: WebhookEvent, url: string) {
    const { data, type } = event;

    // Extract user ID from webhook payload
    // For user.* events, data is UserJSON (created/updated) or UserDeletedJSON (deleted)
    // Both have `id` in their base type. Cast to UserJSON for full field access.
    const userData = data as unknown as UserJSON;
    const clerkUserId = userData?.id;

    // Check if userId exists before making API call
    if (
      !clerkUserId ||
      typeof clerkUserId !== 'string' ||
      clerkUserId.trim() === ''
    ) {
      const detail = 'No valid user ID provided in user.* webhook payload';
      this.loggerService.error(`${url} failed`, { data, detail, type });

      throw new HttpException(
        {
          detail,
          title: 'No user ID',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // For user.created events, use webhook payload data directly
    // The user might not be available in Clerk API yet due to timing
    let firstName: string | undefined;
    let lastName: string | undefined;
    let email: string | undefined;
    let avatar: string | undefined;
    let publicMetadata: Record<string, unknown> = {};

    if (type === 'user.created') {
      // Extract data from webhook payload
      firstName = userData?.first_name ?? undefined;
      lastName = userData?.last_name ?? undefined;
      email = userData?.email_addresses?.[0]?.email_address;
      avatar = userData?.image_url;
      publicMetadata =
        (userData?.public_metadata as Record<string, unknown>) || {};
    } else {
      // For other events (user.updated, etc.), try to fetch from API
      // Fall back to webhook data if API call fails
      try {
        const userData = await this.clerkService.getUser(clerkUserId, {
          skipCache: true,
        });
        firstName = userData.firstName ?? undefined;
        lastName = userData.lastName ?? undefined;
        email = userData.emailAddresses?.[0]?.emailAddress;
        avatar = userData.imageUrl;
        publicMetadata = userData.publicMetadata || {};
      } catch (error: unknown) {
        // If API call fails, fall back to webhook payload data
        this.loggerService.warn(
          `Failed to fetch user ${clerkUserId} from Clerk API, using webhook payload data`,
          { error: (error as Error)?.message, type },
        );

        firstName = userData?.first_name ?? undefined;
        lastName = userData?.last_name ?? undefined;
        email = userData?.email_addresses?.[0]?.email_address;
        avatar = userData?.image_url;
        publicMetadata =
          (userData?.public_metadata as Record<string, unknown>) || {};
      }
    }

    // Check if this is from an invitation (check Clerk metadata)
    const invitationMetadata = publicMetadata || userData?.public_metadata;
    const isInvited = !!invitationMetadata?.organizationId;
    const preCreatedUserId = invitationMetadata?.userId; // Check for pre-created user ID
    const isProactiveOnboarding = !!invitationMetadata?.isProactiveOnboarding;

    // Check if this is a consumer app signup (getshareable.app)
    // Consumer apps pass appSource in unsafeMetadata during signup
    const unsafeMetadata =
      (userData?.unsafe_metadata as Record<string, unknown>) || {};
    const appSource =
      unsafeMetadata.appSource ||
      publicMetadata?.appSource ||
      (userData?.public_metadata as Record<string, unknown>)?.appSource;
    const isConsumerSignup = appSource === AppSource.GETSHAREABLE;

    // Check if user already exists (either by Clerk ID or pre-created from invitation)
    let user = await this.usersService.findOne({
      clerkId: clerkUserId,
    });

    // If not found by Clerk ID and this is an invitation with a pre-created user
    if (!user && preCreatedUserId) {
      user = await this.usersService.findOne({
        _id: preCreatedUserId,
        isInvited: true,
      });

      if (user) {
        // Update the pre-created user with the real Clerk ID. A concurrent
        // Clerk event may have removed the projection between the lookup above
        // and this write; tolerate that and fall through to recreation below.
        user = await this.patchUserProjection(user._id, {
          avatar: avatar ?? user.avatar ?? undefined,
          clerkId: clerkUserId,
          email: email ?? user.email ?? undefined,
          firstName: firstName ?? user.firstName ?? undefined,
          lastName: lastName ?? user.lastName ?? undefined,
        });

        if (user) {
          this.loggerService.log(
            `Updated pre-created invited user ${user._id} with Clerk ID ${clerkUserId}`,
          );
        }
      }
    }

    if (!user) {
      this.loggerService.log(
        `User with Clerk ID ${clerkUserId} not found, creating new user${isInvited ? ' from invitation' : ''}${isConsumerSignup ? ' (consumer)' : ''}`,
      );

      // Create a new user with the Clerk ID
      // For consumer users, set appSource to GETSHAREABLE
      user = await this.usersService.create(
        new UserEntity({
          appSource: isConsumerSignup
            ? AppSource.GETSHAREABLE
            : AppSource.GENFEED,
          avatar,
          clerkId: clerkUserId,
          email,
          firstName: firstName || undefined,
          handle: generateLabel('user'),
          isInvited: isInvited || isConsumerSignup, // Mark consumer users as "invited" to skip post-save hook org creation
          lastName: lastName || undefined,
        }) as Parameters<UsersService['create']>[0],
      );
    } else {
      // Update existing user profile (for both sign-ins and invitations).
      // Clerk retries and duplicate deliveries mean the projection can vanish
      // between the lookup above and this write (TOCTOU). Treat a missing
      // record as an idempotent no-op and ack the webhook so Clerk stops
      // retrying, instead of surfacing a P2025 that 404s the callback.
      const patched = await this.patchUserProjection(user._id, {
        avatar,
        email,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });

      if (!patched) {
        this.loggerService.warn(
          `${url} user projection no longer exists; acking webhook`,
          { clerkUserId, userId: user._id },
        );
        return;
      }

      user = patched;

      if (isInvited) {
        this.loggerService.log(
          `${url} existing user invited to new organization`,
          { clerkUserId },
        );
      }
    }

    if (!user) {
      throw new Error('Failed to create or update user');
    }

    // For new user creation (not updates), mark onboarding as completed immediately
    // New users skip the wizard — they go to Stripe checkout or explore mode
    if (type === 'user.created' && !isInvited && !isConsumerSignup) {
      await this.patchUserProjection(user._id, {
        isOnboardingCompleted: true,
      });
    }

    // Handle organization membership
    let organizationId: string | undefined;
    let brandId: string | undefined;

    // Handle consumer signup flow (getshareable.app users)
    // Consumer users are added to the shared GetShareable organization without signup credits
    if (type === 'user.created' && isConsumerSignup) {
      try {
        const getShareableOrg = await this.handleConsumerSignup(user, url);
        organizationId = getShareableOrg._id;

        this.loggerService.log(`${url} consumer signup completed`, {
          organizationId,
          userId: user._id,
        });
      } catch (error: unknown) {
        this.loggerService.error(
          `${url} failed to handle consumer signup for user ${user._id}`,
          error,
        );
      }
    }

    // For user.created events (B2B), wait for post-save hook to create organization/settings/brand/member
    // The post-save hook in users.module.ts handles all entity creation - we just fetch the IDs
    // Skip this for consumer signups (they don't get their own org)
    if (type === 'user.created' && !isInvited && !isConsumerSignup) {
      try {
        // Wait for post-save hook to complete (it runs asynchronously after user.save())
        // Give it enough time to create organization, settings, brand, and member
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Fetch organization created by post-save hook
        const organization = await this.organizationsService.findOne({
          isDeleted: false,
          user: user._id,
        });

        if (organization) {
          organizationId = organization._id;

          // Fetch brand created by post-save hook
          const brand = await this.brandsService.findOne({
            isDeleted: false,
            organization: organizationId,
          });

          if (brand) {
            brandId = brand._id;
          } else {
            this.loggerService.warn(
              `Brand not found for organization ${organizationId} after post-save hook`,
              { organizationId, userId: user._id },
            );
          }
        } else {
          this.loggerService.error(
            `Organization not found for user ${user._id} after post-save hook - post-save hook may have failed`,
            { userId: user._id },
          );
        }
      } catch (error: unknown) {
        this.loggerService.error(
          `Failed to fetch organization/brand for user ${user._id} after post-save hook`,
          error,
        );
      }
    }

    if (
      isInvited &&
      isProactiveOnboarding &&
      invitationMetadata?.organizationId
    ) {
      // Proactive onboarding: shadow org already exists, transfer ownership
      const orgId = invitationMetadata.organizationId as string;

      try {
        // 1. Transfer shadow org ownership to real user
        await this.organizationsService.patch(orgId, {
          isProactiveOnboarding: false,
          isSelected: true,
          user: user._id,
        });

        // 2. Activate pre-created member
        const member = await this.membersService.findOne({
          organization: orgId,
        });

        if (member) {
          await this.membersService.patch(member._id, {
            isActive: true,
            user: user._id,
          });
        } else {
          const roleId = await this.resolveRoleId(['admin', 'user']);
          await this.membersService.create(
            new MemberEntity({
              isActive: true,
              organization: orgId,
              role: roleId,
              user: user._id,
            }),
          );
        }

        // 3. Transfer brand ownership
        const brand = await this.brandsService.findOne({
          isDeleted: false,
          organization: orgId,
        });

        if (brand) {
          await this.brandsService.patch(brand._id, {
            user: user._id,
          });
          brandId = brand._id;
        }

        organizationId = orgId;

        this.loggerService.log(
          `Proactive onboarding: transferred shadow org ${orgId} to user ${user._id}`,
        );
      } catch (error: unknown) {
        this.loggerService.error(
          `Proactive onboarding: failed to transfer org ${orgId} to user ${user._id}`,
          error,
        );
      }
    } else if (isInvited && invitationMetadata?.organizationId) {
      // User was invited to an organization
      const orgId = invitationMetadata.organizationId as string;
      const roleId = invitationMetadata.roleId as string;

      // Check if member already exists (should exist if pre-created)
      let member = await this.membersService.findOne({
        organization: orgId,
        user: user._id,
      });

      if (member) {
        // Activate the pre-created member
        await this.membersService.patch(member._id, {
          isActive: true,
        });

        this.loggerService.log(
          `Activated pre-created membership for user ${user._id} in organization ${orgId}`,
        );
      } else {
        // Create the member record if it doesn't exist
        member = await this.membersService.create({
          isActive: true,
          organization: orgId,
          role: roleId,
          user: user._id,
        });

        this.loggerService.log(
          `Created membership for user ${user._id} in organization ${orgId}`,
        );
      }

      organizationId = orgId;
    } else {
      // Check for existing organizations (user is the owner)
      const organization = await this.organizationsService.findOne({
        isSelected: true,
        user: user._id,
      });

      organizationId = organization?._id;
    }

    // Check for existing brands
    // For user.created events, brand might not exist yet (post-save hook still running)
    // So we handle this gracefully without throwing an error
    if (organizationId) {
      const brand = await this.brandsService.findOne({
        isSelected: true,
        organization: organizationId,
      });

      if (brand) {
        brandId = brand._id;
      } else {
        // Brand doesn't exist yet - this is expected for user.created events
        // The post-save hook will create it, so we just log and continue
        if (type === 'user.created') {
          this.loggerService.log(
            `Brand not found for organization ${organizationId} yet (post-save hook may still be running)`,
            { organizationId, userId: user._id },
          );
        } else {
          // For other events, log as warning since brand should exist
          this.loggerService.warn(
            `Brand not found for organization ${organizationId}`,
            { organizationId, userId: user._id },
          );
        }
      }
    }

    // Prepare metadata update - only set isSuperAdmin: false for new users
    const orgForMetadata = organizationId
      ? await this.organizationsService.findOne({
          _id: organizationId,
        })
      : null;

    const metadataUpdate: Record<string, unknown> = {
      brand: brandId,
      category: orgForMetadata?.category || OrganizationCategory.BUSINESS,
      isOnboardingCompleted: !isProactiveOnboarding,
      organization: organizationId,
      user: user._id,
    };

    if (isProactiveOnboarding && invitationMetadata?.leadId) {
      metadataUpdate.proactiveLeadId = invitationMetadata.leadId;
    }

    // Only set isSuperAdmin to false if it's not already set (new users)
    const currentMetadata = publicMetadata || {};
    if (currentMetadata.isSuperAdmin === undefined) {
      metadataUpdate.isSuperAdmin = false;
    }

    // For consumer users, add appSource to metadata
    if (isConsumerSignup) {
      metadataUpdate.appSource = AppSource.GETSHAREABLE;
    }

    // Update Clerk metadata with the user's organization
    // For user.created events, the user might not be fully available in Clerk API yet
    // So we handle this gracefully
    try {
      await this.clerkService.updateUserPublicMetadata(
        clerkUserId,
        metadataUpdate,
      );
      this.loggerService.log(
        `Updated Clerk metadata for user ${clerkUserId}`,
        metadataUpdate,
      );
    } catch (error: unknown) {
      // For user.created events, this is expected - user might not be available yet
      if (type === 'user.created') {
        this.loggerService.warn(
          `Failed to update Clerk metadata for newly created user ${clerkUserId} (user may not be fully available in Clerk API yet)`,
          { error: (error as Error)?.message, metadataUpdate },
        );
        // Don't throw - this is not critical for user.created events
      } else {
        // For other events, log as error but don't fail the webhook
        this.loggerService.error(
          `Failed to update Clerk metadata for user ${clerkUserId}`,
          error,
          { metadataUpdate },
        );
      }
    }

    // Send Discord notification for new user signups
    if (type === 'user.created') {
      try {
        await this.notificationsService.sendUserCreatedNotification({
          _id: user._id,
          avatar: user.avatar ?? undefined,
          email: user.email ?? undefined,
          firstName: user.firstName ?? undefined,
          isInvited,
          lastName: user.lastName ?? undefined,
        });
      } catch (error: unknown) {
        // Don't fail the webhook if notification fails
        this.loggerService.warn(
          `Failed to send user created notification for ${user._id}`,
          { error: (error as Error)?.message },
        );
      }
    }

    this.loggerService.log(`${url} processed successfully`, {
      brandId: brandId,
      clerkUserId,
      organizationId: organizationId,
      userId: user._id,
    });
  }

  private async handleOrganizationWebhookEvent(
    event: WebhookEvent,
    url: string,
  ): Promise<void> {
    const data = this.isRecord(event.data) ? event.data : {};
    const clerkOrganizationId = this.readString(data, ['id']);

    if (!clerkOrganizationId) {
      const detail =
        'No valid organization ID provided in Clerk webhook payload';
      this.loggerService.error(`${url} failed`, {
        data,
        detail,
        type: event.type,
      });
      throw new HttpException(
        { detail, title: 'No organization ID' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (event.type === 'organization.deleted') {
      await this.softDeleteOrganizationProjection(data, event.type, url);
      return;
    }

    const organization = await this.upsertOrganizationProjection(data, url);
    const organizationId = this.getDocumentId(organization);

    await this.recordClerkActivity({
      clerkOrganizationId,
      eventType: event.type,
      organizationId,
    });

    this.loggerService.log(`${url} processed organization webhook`, {
      clerkOrganizationId,
      organizationId,
      type: event.type,
    });
  }

  private async upsertOrganizationProjection(
    data: ClerkWebhookRecord,
    url: string,
    fallbackOwner?: UserDocument | null,
  ): Promise<OrganizationDocument | null> {
    const clerkOrganizationId = this.readString(data, ['id']);
    const metadata = this.readPublicMetadata(data);
    const existing = await this.findOrganizationProjection(
      clerkOrganizationId,
      metadata,
    );
    const existingId = this.getDocumentId(existing);
    const label =
      this.readString(data, ['name', 'label']) ||
      (existing ? String(existing.label ?? '') : '') ||
      'Untitled Organization';
    const slugSource = this.readString(data, ['slug']) || label;
    const slug = await this.organizationsService.generateUniqueSlug(
      slugSource,
      existingId || undefined,
    );

    const ownerClerkUserId = this.readString(data, [
      'created_by',
      'createdBy',
      'created_by_user_id',
      'createdByUserId',
    ]);
    const owner =
      fallbackOwner ??
      (await this.getOrCreateUserProjection(ownerClerkUserId, metadata));
    const ownerId = this.getDocumentId(owner);

    if (existingId) {
      const patch: Record<string, unknown> = {
        clerkOrganizationId,
        isDeleted: false,
        label,
        slug,
      };
      if (ownerId) {
        patch.userId = ownerId;
      }

      return await this.organizationsService.patch(existingId, patch);
    }

    if (!ownerId) {
      this.loggerService.warn(
        `${url} skipped Clerk organization projection without local owner`,
        { clerkOrganizationId },
      );
      return null;
    }

    const organization = await this.organizationsService.create(
      new OrganizationEntity({
        category: OrganizationCategory.BUSINESS,
        clerkOrganizationId,
        isSelected: false,
        label,
        onboardingCompleted: true,
        slug,
        userId: ownerId,
      }) as unknown as Parameters<OrganizationsService['create']>[0],
    );
    const organizationId = this.getDocumentId(organization);

    await this.getOrCreateOrganizationSettings(organizationId);
    await this.getOrCreateDefaultBrand(organizationId, ownerId, label);

    return organization;
  }

  private async softDeleteOrganizationProjection(
    data: ClerkWebhookRecord,
    eventType: string,
    url: string,
  ): Promise<void> {
    const clerkOrganizationId = this.readString(data, ['id']);
    const organization = await this.findOrganizationProjection(
      clerkOrganizationId,
      this.readPublicMetadata(data),
    );
    const organizationId = this.getDocumentId(organization);

    if (!organizationId) {
      this.loggerService.warn(
        `${url} skipped Clerk organization deletion for unknown organization`,
        { clerkOrganizationId },
      );
      return;
    }

    await this.organizationsService.patch(organizationId, { isDeleted: true });
    await this.membersService.patchAll(
      { organizationId },
      { isActive: false, isDeleted: true },
    );

    await this.recordClerkActivity({
      clerkOrganizationId,
      eventType,
      organizationId,
    });

    this.loggerService.log(
      `${url} soft-deleted Clerk organization projection`,
      {
        clerkOrganizationId,
        organizationId,
      },
    );
  }

  private async handleMembershipWebhookEvent(
    event: WebhookEvent,
    url: string,
  ): Promise<void> {
    const eventType = String(event.type);
    const data = this.isRecord(event.data) ? event.data : {};
    const clerkMembershipId = this.readString(data, ['id']);

    if (!clerkMembershipId) {
      const detail =
        'No valid organization membership ID provided in Clerk webhook payload';
      this.loggerService.error(`${url} failed`, {
        data,
        detail,
        type: event.type,
      });
      throw new HttpException(
        { detail, title: 'No membership ID' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      eventType === 'organization_membership.deleted' ||
      eventType === 'organizationMembership.deleted'
    ) {
      await this.softDeleteMembershipProjection(data, eventType, url);
      return;
    }

    const publicUserData = this.readRecord(data, [
      'public_user_data',
      'publicUserData',
    ]);
    const metadata = this.readPublicMetadata(data);
    const clerkUserId = this.getClerkUserIdFromMembership(data);
    const user = await this.getOrCreateUserProjection(
      clerkUserId,
      metadata,
      publicUserData,
    );
    const userId = this.getDocumentId(user);

    if (!userId) {
      this.loggerService.warn(
        `${url} skipped Clerk membership projection without local user`,
        { clerkMembershipId, clerkUserId },
      );
      return;
    }

    const organizationRecord = this.readRecord(data, [
      'organization',
      'organization_data',
      'organizationData',
    ]);
    const clerkOrganizationId = this.getClerkOrganizationIdFromMembership(data);
    let organization = await this.findOrganizationProjection(
      clerkOrganizationId,
      metadata,
    );

    if (!organization && organizationRecord) {
      organization = await this.upsertOrganizationProjection(
        organizationRecord,
        url,
        user,
      );
    }

    const organizationId = this.getDocumentId(organization);
    if (!organizationId) {
      this.loggerService.warn(
        `${url} skipped Clerk membership projection without local organization`,
        { clerkMembershipId, clerkOrganizationId },
      );
      return;
    }

    const clerkRole =
      this.readString(data, ['role', 'role_name', 'roleName']) || 'org:member';
    const roleId = await this.resolveRoleId(
      this.getRoleLookupKeysForClerkRole(clerkRole),
    );
    let member = await this.membersService.findOne({ clerkMembershipId });
    if (!member) {
      member = await this.membersService.findOne({
        organization: organizationId,
        user: userId,
      });
    }

    if (member?._id) {
      await this.membersService.patch(member._id, {
        clerkMembershipId,
        isActive: true,
        isDeleted: false,
        roleId,
      });
    } else {
      member = await this.membersService.create(
        new MemberEntity({
          clerkMembershipId,
          isActive: true,
          organizationId,
          roleId,
          userId,
        }),
      );
    }

    await this.recordClerkActivity({
      clerkMembershipId,
      clerkOrganizationId,
      eventType,
      organizationId,
      role: clerkRole,
      userId,
    });

    this.loggerService.log(`${url} processed membership webhook`, {
      clerkMembershipId,
      clerkOrganizationId,
      organizationId,
      type: eventType,
      userId,
    });
  }

  private async softDeleteMembershipProjection(
    data: ClerkWebhookRecord,
    eventType: string,
    url: string,
  ): Promise<void> {
    const clerkMembershipId = this.readString(data, ['id']);
    let member = await this.membersService.findOne({ clerkMembershipId });

    if (!member) {
      const organization = await this.findOrganizationProjection(
        this.getClerkOrganizationIdFromMembership(data),
        this.readPublicMetadata(data),
      );
      const organizationId = this.getDocumentId(organization);
      const user = await this.findUserProjection(
        this.getClerkUserIdFromMembership(data),
        this.readPublicMetadata(data),
      );
      const userId = this.getDocumentId(user);

      if (organizationId && userId) {
        member = await this.membersService.findOne({
          organization: organizationId,
          user: userId,
        });
      }
    }

    const memberId = this.getDocumentId(member);
    if (!memberId) {
      this.loggerService.warn(
        `${url} skipped Clerk membership deletion for unknown membership`,
        { clerkMembershipId },
      );
      return;
    }

    await this.membersService.patch(memberId, {
      isActive: false,
      isDeleted: true,
    });

    const memberRecord = member as unknown as ClerkWebhookRecord;
    await this.recordClerkActivity({
      clerkMembershipId,
      eventType,
      organizationId: this.readString(memberRecord, [
        'organizationId',
        'organization',
      ]),
      userId: this.readString(memberRecord, ['userId', 'user']),
    });

    this.loggerService.log(`${url} soft-deleted Clerk membership projection`, {
      clerkMembershipId,
      memberId,
    });
  }

  private async handleInvitationWebhookEvent(
    event: WebhookEvent,
    url: string,
  ): Promise<void> {
    const eventType = String(event.type);
    const data = this.isRecord(event.data) ? event.data : {};
    const metadata = this.readPublicMetadata(data);
    const organizationRecord = this.readRecord(data, ['organization']);
    const clerkOrganizationId =
      this.readString(organizationRecord, ['id']) ||
      this.readString(data, ['organization_id', 'organizationId']);
    const organization = await this.findOrganizationProjection(
      clerkOrganizationId,
      metadata,
    );
    const organizationId = this.getDocumentId(organization);

    await this.recordClerkActivity({
      clerkOrganizationId,
      eventType,
      organizationId,
      userId: this.readString(metadata, ['invitedByUser', 'userId', 'user']),
    });

    this.loggerService.log(`${url} processed organization invitation webhook`, {
      clerkOrganizationId,
      invitationId: this.readString(data, ['id']),
      organizationId,
      type: eventType,
    });
  }

  /**
   * Get or create the shared GetShareable organization for consumer users
   * This organization is used for all getshareable.app users
   */
  private async getOrCreateGetShareableOrganization(
    ownerUserId: string,
  ): Promise<OrganizationDocument> {
    // Find existing GetShareable organization
    let organization = await this.organizationsService.findOne({
      isDeleted: false,
      label: GETSHAREABLE_ORG_NAME,
    });

    if (!organization) {
      // Create the GetShareable organization (should only happen once)
      organization = await this.organizationsService.create(
        new OrganizationEntity({
          category: OrganizationCategory.BUSINESS,
          isSelected: false,
          label: GETSHAREABLE_ORG_NAME,
          onboardingCompleted: true,
          slug: 'getshareable',
          user: ownerUserId,
        }) as unknown as Parameters<OrganizationsService['create']>[0],
      );

      this.loggerService.log(
        `Created GetShareable organization: ${organization._id}`,
      );
    }

    return organization;
  }

  /**
   * Handle consumer signup flow for getshareable.app users
   * 1. Create user settings
   * 2. Add user to GetShareable organization as member
   * 3. Link user to the shared organization without free signup credits
   */
  private async handleConsumerSignup(
    user: UserDocument,
    url: string,
  ): Promise<OrganizationDocument> {
    const userId = user._id.toString();

    // 1. Create user settings
    await this.settingsService.create(
      new SettingEntity({
        favoriteModelKeys: [],
        isAdvancedMode: true,
        isFirstLogin: true,
        isMenuCollapsed: false,
        isSidebarProgressCollapsed: false,
        isVerified: false,
        theme: 'dark',
        user: userId,
      }) as unknown as Parameters<SettingsService['create']>[0],
    );

    // 2. Get or create the GetShareable organization
    const getShareableOrg =
      await this.getOrCreateGetShareableOrganization(userId);

    // 3. Get viewer role (read-only access)
    const viewerRoleId = await this.resolveRoleId(['viewer', 'user', 'admin']);

    // Core signup logic (steps 4-5) — runs atomically inside a transaction when available
    const signupCore = async () => {
      // 4. Create member linking user to GetShareable org
      await this.membersService.create(
        new MemberEntity({
          isActive: true,
          organization: getShareableOrg._id,
          role: viewerRoleId,
          user: userId,
        }),
      );
    };

    // Use transaction if available (requires replica set), otherwise fallback
    this.transactionUtil
      ? await this.transactionUtil.runInTransaction(() => signupCore())
      : await signupCore();

    this.loggerService.log(`${url} consumer signup entities created`, {
      organizationId: getShareableOrg._id,
      userId,
    });

    return getShareableOrg;
  }

  private async resolveRoleId(keys: string[]): Promise<string> {
    for (const key of keys) {
      const role = await this.rolesService.findOne({
        isDeleted: false,
        key,
      });

      if (role?._id) {
        return role._id.toString();
      }
    }

    throw new HttpException(
      { detail: 'No role found to assign', title: 'Internal Server Error' },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
