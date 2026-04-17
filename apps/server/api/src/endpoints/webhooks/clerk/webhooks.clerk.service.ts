import { BrandsService } from '@api/collections/brands/services/brands.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { UserEntity } from '@api/collections/users/entities/user.entity';
import { UserDocument } from '@api/collections/users/schemas/user.schema';
import { UsersService } from '@api/collections/users/services/users.service';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { generateLabel } from '@api/shared/utils/label/label.util';
import type { UserJSON } from '@clerk/backend/dist/api/resources/JSON';
import { WebhookEvent } from '@clerk/express/webhooks';
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
    @Optional() private readonly transactionUtil?: TransactionUtil,
  ) {}

  async handleWebhookEvent(event: WebhookEvent, url: string) {
    const { data, type } = event;

    // Only handle user.* events (user.created, user.updated, etc.)
    // Reject all other event types (session.*, organization.*, etc.)
    if (!type.startsWith('user.')) {
      const detail = `Event type '${type}' is not supported. Only user.* events are handled by this webhook.`;
      this.loggerService.warn(`${url} rejected`, { detail, type });

      throw new HttpException(
        {
          detail,
          title: 'Unsupported event type',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

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
        // Update the pre-created user with the real Clerk ID
        user = await this.usersService.patch(user._id, {
          avatar: avatar || user.avatar,
          clerkId: clerkUserId,
          email: email || user.email,
          firstName: firstName || user.firstName,
          lastName: lastName || user.lastName,
        });

        this.loggerService.log(
          `Updated pre-created invited user ${user._id} with Clerk ID ${clerkUserId}`,
        );
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
        }),
      );
    } else {
      // Update existing user profile (for both sign-ins and invitations)
      user = await this.usersService.patch(user._id, {
        avatar,
        email,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });

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
      await this.usersService.patch(user._id, { isOnboardingCompleted: true });
    }

    // Handle organization membership
    let organizationId: string | undefined;
    let brandId: string | undefined;

    // Handle consumer signup flow (getshareable.app users)
    // Consumer users are added to the shared GetShareable organization without signup credits
    if (type === 'user.created' && isConsumerSignup) {
      try {
        await this.handleConsumerSignup(user, url);

        // Get the GetShareable organization for metadata
        const getShareableOrg =
          await this.getOrCreateGetShareableOrganization();
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
          await this.membersService.create({
            isActive: true,
            organization: orgId,
            user: user._id,
          });
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
          avatar: user.avatar,
          email: user.email,
          firstName: user.firstName,
          isInvited,
          lastName: user.lastName,
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

  /**
   * Get or create the shared GetShareable organization for consumer users
   * This organization is used for all getshareable.app users
   */
  private async getOrCreateGetShareableOrganization() {
    // Find existing GetShareable organization
    let organization = await this.organizationsService.findOne({
      isDeleted: false,
      name: GETSHAREABLE_ORG_NAME,
    });

    if (!organization) {
      // Create the GetShareable organization (should only happen once)
      organization = await this.organizationsService.create({
        isDeleted: false,
        isSelected: false,
        name: GETSHAREABLE_ORG_NAME,
        // No user owner - this is a system-level organization
      } as unknown);

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
  private async handleConsumerSignup(user: UserDocument, url: string) {
    const userId = user._id.toString();

    // 1. Create user settings
    await this.settingsService.create({
      isFirstLogin: true,
      isVerified: false,
      theme: 'dark',
      user: userId,
    } as unknown);

    // 2. Get or create the GetShareable organization
    const getShareableOrg = await this.getOrCreateGetShareableOrganization();

    // 3. Get viewer role (read-only access)
    const viewerRole = await this.rolesService.findOne({
      isDeleted: false,
      key: 'viewer',
    });

    if (!viewerRole) {
      this.loggerService.warn(
        `${url} viewer role not found for consumer signup`,
      );
    }

    // Core signup logic (steps 4-5) — runs atomically inside a transaction when available
    const signupCore = async () => {
      // 4. Create member linking user to GetShareable org
      await this.membersService.create({
        isActive: true,
        organization: getShareableOrg._id,
        role: viewerRole ? viewerRole._id : (undefined as unknown),
        user: userId,
      });
    };

    // Use transaction if available (requires replica set), otherwise fallback
    this.transactionUtil
      ? await this.transactionUtil.runInTransaction(() => signupCore())
      : await signupCore();

    this.loggerService.log(`${url} consumer signup entities created`, {
      organizationId: getShareableOrg._id,
      userId,
    });
  }
}
