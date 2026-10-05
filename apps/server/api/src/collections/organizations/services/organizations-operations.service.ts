import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { ORGANIZATION_CREATED_EVENT } from '@api/collections/organizations/constants/organization-events.constants';
import type { OrganizationCreatedEvent } from '@api/collections/organizations/organization-events.types';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { OrganizationLogoService } from '@api/collections/organizations/services/organization-logo.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { resolveOrganizationCreatorRole } from '@api/collections/roles/utils/resolve-organization-creator-role.util';
import { SkillLibraryService } from '@api/collections/skills/services/skill-library.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import { PlanLimitExceededException } from '@api/exceptions/business-logic.exception';
import {
  getIsSuperAdmin,
  getSubscriptionTier,
} from '@api/helpers/utils/auth/auth.util';
import { generateLabel } from '@api/shared/utils/label/label.util';
import { isCloudDeployment } from '@genfeedai/config';
import type { OrganizationOption } from '@genfeedai/contracts/interfaces';
import {
  getOrganizationLimitForTier,
  getUpgradeTierForLimit,
} from '@genfeedai/pricing';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface CreateOrganizationOperationInput {
  billingAccountId?: string;
  description?: string;
  label: string;
  websiteUrl?: string;
}

export interface OrganizationSelectionResult {
  brand: { id: string; label: string };
  organization: { id: string; label: string };
}

@Injectable()
export class OrganizationsOperationsService {
  constructor(
    private readonly billingAccountsService: BillingAccountsService,
    private readonly brandsService: BrandsService,
    private readonly membersService: MembersService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly organizationsService: OrganizationsService,
    private readonly rolesService: RolesService,
    private readonly usersService: UsersService,
    private readonly userAccessCacheService: UserAccessCacheService,
    private readonly organizationLogoService: OrganizationLogoService,
    private readonly eventEmitter: EventEmitter2,
    private readonly skillLibrary?: SkillLibraryService,
  ) {}

  async canUserReadEntity(
    user: User,
    organization: OrganizationDocument,
    hasSuperAdminAccess = getIsSuperAdmin(user),
  ): Promise<boolean> {
    if (hasSuperAdminAccess) {
      return true;
    }

    const organizationId = organization?.id?.toString();
    const userId = this.resolveUserId(user);
    if (!organizationId || !userId) {
      return false;
    }

    if (
      organizationId === user.organizationId ||
      this.isOrganizationOwner(organization, userId)
    ) {
      return true;
    }

    // Membership lookup for the entity's own organization, which is not
    // necessarily the request tenant; the query is pinned to that org + user.
    const member = await runWithTenantContext({ organizationId }, () =>
      this.membersService.findOne({
        isActive: true,
        organizationId,
        userId,
      }),
    );

    return Boolean(member);
  }

  async findMine(user: User): Promise<OrganizationOption[]> {
    const userId = this.requireUserId(user);
    const members = await this.membersService.findActiveForUserAccess(userId);
    const organizationIds = [
      ...new Set(
        members.map((member) => member.organizationId).filter(Boolean),
      ),
    ];

    if (!organizationIds.length) {
      return [];
    }

    const organizations = await Promise.all(
      organizationIds.map((organizationId) =>
        this.organizationsService.findOne({
          id: organizationId,
          isDeleted: false,
        }),
      ),
    );

    const logoUrls =
      await this.organizationLogoService.resolveLogoUrls(organizationIds);

    return Promise.all(
      organizations
        .filter(
          (organization): organization is NonNullable<typeof organization> =>
            organization !== null,
        )
        .map(async (organization) => {
          // Each organization comes from the user's own active memberships
          // (findActiveForUserAccess), so scope the lookup to that org.
          const brand = await runWithTenantContext(
            { organizationId: organization.id.toString() },
            () =>
              this.brandsService.findOne({
                isDeleted: false,
                organizationId: organization.id,
              }),
          );

          return {
            brand: brand
              ? { id: brand.id.toString(), label: brand.label }
              : null,
            id: organization.id.toString(),
            isActive: user.organizationId === organization.id.toString(),
            isOwner: this.isOrganizationOwner(organization, userId),
            label: organization.label,
            logoUrl: logoUrls.get(organization.id.toString()) ?? null,
            slug: organization.slug ?? '',
          };
        }),
    );
  }

  async createOrganization(
    input: CreateOrganizationOperationInput,
    user: User,
  ): Promise<OrganizationSelectionResult> {
    const userId = this.requireUserId(user);
    const label = input.label?.trim();
    if (!label) {
      throw new HttpException(
        { detail: 'Organization name is required', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.assertOrganizationCreationAllowed(user, userId);

    const userDocument = await this.usersService.findOne({ id: userId });
    if (!userDocument) {
      throw new HttpException(
        { detail: 'User document not found', title: 'Not Found' },
        HttpStatus.NOT_FOUND,
      );
    }

    const slug = await this.organizationsService.generateUniqueSlug(label);
    const organization = await this.organizationsService.create({
      isSelected: false,
      label,
      slug,
      userId,
    });
    const organizationId = organization.id.toString();

    // Everything below provisions the NEW organization, which is not the
    // creator's request tenant; scope it to the org it creates.
    const brand = await runWithTenantContext({ organizationId }, () =>
      this.provisionOrganization({ input, label, organization, user, userId }),
    );

    await this.usersService.patch(userId, {
      lastUsedOrganizationId: organizationId,
    });
    await this.userAccessCacheService.invalidateAll(userId);

    // The brands layer sits above this collection, so the background brand
    // scan listens for the event rather than being called. `emit` does not
    // await listeners, so the response never waits on queueing.
    const event: OrganizationCreatedEvent = {
      brandId: brand.id.toString(),
      organizationId,
      userId,
      ...(input.websiteUrl?.trim()
        ? { websiteUrl: input.websiteUrl.trim() }
        : {}),
    };
    this.eventEmitter.emit(ORGANIZATION_CREATED_EVENT, event);

    return {
      brand: { id: brand.id.toString(), label: brand.label },
      organization: { id: organizationId, label: organization.label },
    };
  }

  private async provisionOrganization(params: {
    input: CreateOrganizationOperationInput;
    label: string;
    organization: OrganizationDocument;
    user: User;
    userId: string;
  }) {
    const { input, label, organization, user, userId } = params;
    const organizationId = organization.id.toString();

    await this.organizationSettingsService.ensureForOrganization(
      organization.id,
    );

    const brand = await this.brandsService.create({
      backgroundColor: '#000000',
      // An empty description stays empty: placeholder copy would read as real
      // brand context to every prompt builder.
      description: input.description?.trim() || undefined,
      fontFamily: 'montserrat-black',
      label,
      organizationId: organization.id,
      primaryColor: '#000000',
      secondaryColor: '#FFFFFF',
      slug: generateLabel('brand'),
      userId,
    } as unknown as Parameters<BrandsService['create']>[0]);

    const role = await resolveOrganizationCreatorRole(this.rolesService);
    await this.membersService.create({
      currentBrandId: brand.id.toString(),
      isActive: true,
      organizationId: organization.id,
      roleId: String(role.id),
      roleKey: role.key,
      userId,
    } as unknown as Parameters<MembersService['create']>[0]);

    const settings = await this.organizationSettingsService.findOne({
      organizationId: organization.id,
    });
    await this.billingAccountsService.ensureForOrganization({
      billingAccountId: input.billingAccountId,
      isSeparateAccount: getIsSuperAdmin(user),
      label,
      organizationId,
      planTier: settings?.subscriptionTier ?? null,
      userId,
    });
    await this.skillLibrary?.attachSharedDefaults(organizationId, userId);

    return brand;
  }

  async switchOrganization(
    organizationId: string,
    user: User,
  ): Promise<OrganizationSelectionResult> {
    const userId = this.requireUserId(user);
    // Authorization (membership or superadmin) is the first statement inside
    // the switch; every query after it targets the selected organization,
    // which is intentionally not the caller's current request tenant.
    return runWithTenantContext({ organizationId }, () =>
      this.switchIntoOrganization(organizationId, user, userId),
    );
  }

  private async switchIntoOrganization(
    organizationId: string,
    user: User,
    userId: string,
  ): Promise<OrganizationSelectionResult> {
    const member = await this.membersService.findOne({
      isActive: true,
      organizationId,
      userId,
    });

    if (!member && !getIsSuperAdmin(user)) {
      throw new HttpException(
        {
          detail: 'You are not a member of this organization',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    let brand = member?.currentBrandId
      ? await this.brandsService.findOne({
          id: member.currentBrandId,
          organizationId,
        })
      : null;
    if (!brand) {
      brand = await this.brandsService.findOne({ organizationId });
    }

    if (!brand) {
      throw new HttpException(
        { detail: 'No brand found for this organization', title: 'Not Found' },
        HttpStatus.NOT_FOUND,
      );
    }

    await this.usersService.patch(userId, {
      lastUsedOrganizationId: organizationId,
    });
    if (member) {
      await this.membersService.setCurrentBrand(
        {
          isActive: true,
          isDeleted: false,
          organizationId,
          userId,
        },
        brand.id.toString(),
      );
    }
    await this.userAccessCacheService.invalidateAll(userId);

    const organization = await this.organizationsService.findOne({
      id: organizationId,
    });

    return {
      brand: { id: brand.id.toString(), label: brand.label },
      organization: {
        id: organizationId,
        label: organization?.label ?? '',
      },
    };
  }

  private async assertOrganizationCreationAllowed(
    user: User,
    userId: string,
  ): Promise<void> {
    if (!isCloudDeployment() || getIsSuperAdmin(user)) {
      return;
    }

    const settings = user.organizationId
      ? await this.organizationSettingsService.findOne({
          organizationId: user.organizationId,
        })
      : null;
    const tier = settings?.subscriptionTier ?? getSubscriptionTier(user);
    const organizationLimit = getOrganizationLimitForTier(tier);
    if (organizationLimit === null) {
      return;
    }

    const organizationCount = await this.organizationsService.count({
      isDeleted: false,
      userId,
    });
    if (organizationCount < organizationLimit) {
      return;
    }

    throw new PlanLimitExceededException({
      currentCount: organizationCount,
      limit: organizationLimit,
      resource: 'organizations',
      upgradeTier: getUpgradeTierForLimit('organizations', tier),
    });
  }

  private isOrganizationOwner(
    organization: { userId?: string | null },
    userId: string,
  ): boolean {
    return organization.userId === userId;
  }

  private requireUserId(user: User): string {
    const userId = this.resolveUserId(user);
    if (!userId) {
      throw new HttpException(
        { detail: 'User not found in metadata', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    return userId;
  }

  private resolveUserId(user: User): string | undefined {
    return user.userId ?? user.id;
  }
}
